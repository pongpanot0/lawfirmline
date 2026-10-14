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
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error_description') errorDescription: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('admin_consent') adminConsent?: string,
  ) {
    // Tenant-wide admin consent (the link we hand to a client's IT admin) comes back without a
    // `state`: that admin is not a Samnuan user, so show a plain result page instead of our login.
    if (!state) {
      const granted = !errorDescription && adminConsent?.toLowerCase() === 'true';
      return res.status(200).type('html').send(adminConsentPage(granted, errorDescription));
    }

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

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Shown to a client's IT admin after the Microsoft admin-consent screen. */
export function adminConsentPage(granted: boolean, errorDescription?: string): string {
  const body = granted
    ? `<h1>✅ อนุมัติสิทธิ์เรียบร้อยแล้ว</h1>
       <p>องค์กรของคุณอนุมัติแอป <b>Samnuan Outlook</b> แล้ว พนักงานเชื่อมต่อ Microsoft 365 ในระบบสำนวนได้ทันที (ตั้งค่า → Microsoft 365 → เชื่อม Microsoft 365)</p>
       <p>ปิดหน้านี้ได้เลย</p>`
    : `<h1>❌ ยังไม่ได้อนุมัติสิทธิ์</h1>
       <p>Microsoft แจ้งว่า: ${escapeHtml((errorDescription || 'ไม่ได้รับการอนุมัติ').slice(0, 500))}</p>
       <p>ตรวจว่าล็อกอินด้วยบัญชีผู้ดูแลระบบ (Global Administrator หรือ Cloud Application Administrator) แล้วเปิดลิงก์อนุมัติอีกครั้ง หรือติดต่อ hello@samnuan.com</p>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Samnuan · Microsoft 365</title>
<style>body{font-family:system-ui,-apple-system,"Sukhumvit Set",sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#1a1a1a;line-height:1.6}h1{font-size:1.5rem}</style>
</head><body>${body}</body></html>`;
}
