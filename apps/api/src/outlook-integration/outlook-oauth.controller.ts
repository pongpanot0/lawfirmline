import { Controller, Get, Logger, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { OutlookOAuthService } from './outlook-oauth.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';

@Controller('outlook')
export class OutlookOAuthController {
  private readonly logger = new Logger(OutlookOAuthController.name);

  constructor(
    private oauth: OutlookOAuthService,
    private graph: OutlookGraphClient,
    private connections: OutlookConnectionsService,
    private subscriptions: OutlookSubscriptionService,
    private config: ConfigService,
  ) {}

  /** Called by the settings page — returns the Microsoft consent URL to redirect the browser to. */
  @Get('connect')
  @UseGuards(JwtAuthGuard)
  connect(@CurrentUser() user: AuthUser) {
    const state = this.oauth.signState(user.firmId, user.id);
    return { url: this.oauth.buildAuthorizationUrl(state) };
  }

  /**
   * Microsoft redirects the user's browser here after consent — this is a
   * plain unauthenticated GET (no Authorization header), so the firm/user
   * come from the signed `state`, not from a JWT.
   */
  @Get('callback')
  @SkipSubscription()
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error_description') errorDescription: string, @Res() res: Response) {
    const webAppUrl = (this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const redirectTo = (status: 'connected' | 'error', message?: string) => {
      const url = new URL(`${webAppUrl}/settings/integrations`);
      url.searchParams.set('outlook', status);
      if (message) url.searchParams.set('message', message);
      return res.redirect(url.toString());
    };

    if (errorDescription) {
      return redirectTo('error', errorDescription);
    }

    try {
      const { firmId, userId } = this.oauth.verifyState(state);
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
