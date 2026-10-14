import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutlookSendService } from './outlook-send.service';
import { SendCaseEmailDto } from './dto/send-case-email.dto';

/**
 * Compose / reply from the signed-in user's own Microsoft mailbox, scoped to one case.
 * Path is `outbound-email`, not `emails`, to avoid confusion with Phase B's `cases/:caseId/email/threads/*` (singular `email`).
 */
@Controller('cases/:caseId/outbound-email')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseEmailSendController {
  constructor(private readonly sender: OutlookSendService) {}

  @Get('compose-options')
  composeOptions(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.sender.composeOptions(user, caseId);
  }

  @Post('send')
  @HttpCode(200)
  send(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: SendCaseEmailDto) {
    return this.sender.send(user, caseId, dto);
  }
}
