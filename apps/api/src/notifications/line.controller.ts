import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, AuthUser } from '@lawfirm/shared';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';
import { SkipSubscription } from '../saas/decorators/saas.decorators';

interface LineWebhookBody {
  destination?: string;
  events?: Array<{
    type: string;
    replyToken?: string;
    source?: { userId?: string; type?: string };
    message?: { type: string; text?: string };
  }>;
}

@Controller()
export class LineController {
  private readonly logger = new Logger(LineController.name);

  constructor(
    private line: LineMessagingService,
    private lineLink: LineLinkService,
  ) {}

  @Post('line/webhook')
  @HttpCode(200)
  @SkipSubscription()
  async handleWebhook(
    @Headers('x-line-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: LineWebhookBody,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(body);

    if (!this.line.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('LINE webhook signature verification failed');
      return { ok: false };
    }

    for (const event of body.events ?? []) {
      if (event.type === 'follow' && event.source?.userId) {
        this.logger.log(`LINE user followed: ${event.source.userId}`);
        if (event.replyToken) {
          await this.line.replyText(
            event.replyToken,
            '👋 สวัสดี! เพื่อเชื่อมต่อบัญชี LexFlow กรุณาไปที่ Settings → LINE แล้วส่งรหัสเชื่อมต่อ (เช่น LF-XXXXXX) มาที่แชทนี้',
          );
        }
      }

      if (
        event.type === 'message' &&
        event.message?.type === 'text' &&
        event.source?.userId
      ) {
        const text = event.message.text ?? '';
        this.logger.log(
          `LINE message from ${event.source.userId}: ${text}`,
        );

        const reply = await this.lineLink.handleIncomingMessage(
          event.source.userId,
          text,
        );
        if (reply && event.replyToken) {
          await this.line.replyText(event.replyToken, reply);
        }
      }
    }

    return { ok: true };
  }

  @Get('integrations/line/status')
  @UseGuards(JwtAuthGuard)
  getStatus() {
    return this.line.getStatus();
  }

  @Get('integrations/line/me')
  @UseGuards(JwtAuthGuard)
  getPersonalStatus(@CurrentUser() user: AuthUser) {
    return this.lineLink.getPersonalStatus(user.id);
  }

  @Post('integrations/line/me/link-code')
  @UseGuards(JwtAuthGuard)
  createLinkCode(@CurrentUser() user: AuthUser) {
    return this.lineLink.createLinkCode(user.id);
  }

  @Delete('integrations/line/me')
  @UseGuards(JwtAuthGuard)
  disconnect(@CurrentUser() user: AuthUser) {
    return this.lineLink.disconnect(user.id);
  }

  @Post('integrations/line/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  testMessage() {
    return this.line.sendTestMessage();
  }
}
