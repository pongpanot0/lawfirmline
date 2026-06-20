import {
  Body,
  Controller,
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
import { Role } from '@lawfirm/shared';
import { LineMessagingService } from './line-messaging.service';

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

  constructor(private line: LineMessagingService) {}

  @Post('line/webhook')
  @HttpCode(200)
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
      }
      if (event.type === 'message' && event.message?.type === 'text') {
        this.logger.log(
          `LINE message from ${event.source?.userId ?? 'unknown'}: ${event.message.text}`,
        );
      }
    }

    return { ok: true };
  }

  @Get('integrations/line/status')
  @UseGuards(JwtAuthGuard)
  getStatus() {
    return this.line.getStatus();
  }

  @Post('integrations/line/test')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  testMessage() {
    return this.line.sendTestMessage();
  }
}
