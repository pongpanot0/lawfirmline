import { BadRequestException, Controller, Get, Logger, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { FirmLinkService } from '../notifications/firm-link.service';
import { OutlookOAuthService } from './outlook-oauth.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';

const NONCE_COOKIE = 'm365_oauth_nonce';

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

@Controller('outlook')
export class OutlookOAuthController {
  private readonly logger = new Logger(OutlookOAuthController.name);

  constructor(
    private oauth: OutlookOAuthService,
    private graph: OutlookGraphClient,
    private connections: OutlookConnectionsService,
    private subscriptions: OutlookSubscriptionService,
    private config: ConfigService,
    private firmLink: FirmLinkService,
  ) {}

  /**
   * Settings page calls this with its JWT (an XHR), and the response sets the
   * nonce cookie in that browser. The callback only accepts a state whose nonce
   * matches the cookie, so a Microsoft consent URL forwarded to someone else
   * fails the check, and an attacker cannot make a victim's browser call this
   * endpoint with the victim's JWT to obtain a state bound to the attacker's firm.
   */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const nonce = crypto.randomBytes(16).toString('hex');
    res.cookie(NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: req.secure,
      sameSite: 'lax',
      path: '/outlook',
      maxAge: 10 * 60_000,
    });
    return { url: this.oauth.buildAuthorizationUrl(this.oauth.signState(user.firmId, user.id, nonce)) };
  }

  /**
   * Microsoft redirects the user's browser here after consent — this is a
   * plain unauthenticated GET (no Authorization header), so the firm/user
   * come from the signed `state`, not from a JWT.
   */
  @Get('callback')
  @SkipSubscription()
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error_description') errorDescription: string, @Req() req: Request, @Res() res: Response) {
    // The firm is only known once `state` verifies, so start at the root origin
    // and narrow to the firm's own subdomain as soon as we have it — otherwise
    // the user lands on a page with no tenant.
    res.clearCookie(NONCE_COOKIE, { path: '/outlook' });
    let origin = this.firmLink.rootOrigin();
    const redirectTo = (status: 'connected' | 'error', message?: string) => {
      const url = new URL(`${origin.replace(/\/$/, '')}/settings`);
      url.searchParams.set('outlook', status);
      if (message) url.searchParams.set('message', message);
      return res.redirect(url.toString());
    };

    if (errorDescription) {
      return redirectTo('error', errorDescription);
    }

    try {
      const { firmId, userId, nonce } = this.oauth.verifyState(state);
      const cookieNonce = readCookie(req, NONCE_COOKIE);
      if (!cookieNonce || cookieNonce !== nonce) {
        throw new BadRequestException('กรุณาเริ่มเชื่อมต่อจากหน้าตั้งค่าในเบราว์เซอร์เดียวกัน');
      }
      origin = await this.firmLink.originForFirm(firmId);
      const tokens = await this.oauth.exchangeCodeForTokens(code);
      const mailboxAddress = await this.graph.getMailboxAddress(tokens.accessToken);

      const connection = await this.connections.upsertFromOAuth(
        { firmId, id: userId } as AuthUser,
        tokens,
        mailboxAddress,
      );

      try {
        await this.subscriptions.ensureSubscription(connection.id);
      } catch (subError) {
        // The mailbox is connected and will still sync via manual/cron
        // polling — a failed webhook subscription should not block connect.
        this.logger.warn(`Could not create Graph subscription for ${connection.id}: ${subError}`);
      }

      return redirectTo('connected');
    } catch (error) {
      this.logger.error(`Outlook OAuth callback failed: ${error}`);
      return redirectTo('error', error instanceof Error ? error.message : 'เชื่อมต่อไม่สำเร็จ');
    }
  }
}
