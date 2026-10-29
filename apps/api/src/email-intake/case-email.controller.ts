import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CaseEmailService } from './case-email.service';
import { LinkThreadToCaseDto } from './dto/email-intake.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class CaseEmailController {
  constructor(private service: CaseEmailService) {}

  @Get('email-intake/threads/:threadId/case-suggestions')
  suggestions(@CurrentUser() user: AuthUser, @Param('threadId') threadId: string) {
    return this.service.suggestCasesForThread(user, threadId);
  }

  @Post('email-intake/threads/:threadId/case-link')
  link(@CurrentUser() user: AuthUser, @Param('threadId') threadId: string, @Body() dto: LinkThreadToCaseDto) {
    return this.service.linkThread(user, threadId, dto.caseId);
  }

  @Delete('email-intake/threads/:threadId/case-link')
  unlink(@CurrentUser() user: AuthUser, @Param('threadId') threadId: string) {
    return this.service.unlinkThread(user, threadId);
  }

  @Get('email/search')
  search(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.service.searchThreads(user, q);
  }

  @Get('cases/:caseId/email/threads')
  @UseGuards(CaseAccessGuard)
  listCaseThreads(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.service.listCaseThreads(user, caseId);
  }

  @Get('cases/:caseId/email/threads/:threadId')
  @UseGuards(CaseAccessGuard)
  getCaseThread(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('threadId') threadId: string) {
    return this.service.getCaseThread(user, caseId, threadId);
  }

  @Get('cases/:caseId/email/threads/:threadId/unknown-addresses')
  @UseGuards(CaseAccessGuard)
  unknownAddresses(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('threadId') threadId: string) {
    return this.service.listUnknownAddresses(user, caseId, threadId);
  }

  @Post('cases/:caseId/email/threads/:threadId/reply-dismiss')
  @UseGuards(CaseAccessGuard)
  dismissReply(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('threadId') threadId: string) {
    return this.service.setReplyDismissed(user, caseId, threadId, true);
  }

  @Delete('cases/:caseId/email/threads/:threadId/reply-dismiss')
  @UseGuards(CaseAccessGuard)
  undismissReply(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('threadId') threadId: string) {
    return this.service.setReplyDismissed(user, caseId, threadId, false);
  }

  @Post('cases/:caseId/email/attachments/:attachmentId/save-to-documents')
  @UseGuards(CaseAccessGuard)
  saveAttachment(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('attachmentId') attachmentId: string) {
    return this.service.saveAttachmentToCase(user, caseId, attachmentId);
  }
}
