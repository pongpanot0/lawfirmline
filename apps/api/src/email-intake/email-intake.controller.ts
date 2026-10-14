import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { Response } from 'express';
import { EmailIntakeService } from './email-intake.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { FileStorageService } from '../common/services/file-storage.service';
import { AcceptIntakeFromThreadDto, ResolveFieldProposalDto, SeedMockReplyDto } from './dto/email-intake.dto';

@Controller('email-intake')
@UseGuards(JwtAuthGuard)
export class EmailIntakeController {
  constructor(
    private service: EmailIntakeService,
    private fileStorage: FileStorageService,
  ) {}

  @Get('threads')
  listThreads(@CurrentUser() user: AuthUser) {
    return this.service.listThreads(user);
  }

  @Get('threads/:threadId')
  getThread(@CurrentUser() user: AuthUser, @Param('threadId') threadId: string) {
    return this.service.getThread(user, threadId);
  }

  @Get('attachments/:attachmentId/download')
  async downloadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const a = await this.service.getAttachmentForDownload(user, attachmentId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(a.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(a.filename));
    const stream = await this.fileStorage.openDownloadStream(a.storagePath);
    stream.pipe(res);
  }

  @Post('threads/:threadId/accept')
  acceptIntakeFromThread(
    @CurrentUser() user: AuthUser,
    @Param('threadId') threadId: string,
    @Body() dto: AcceptIntakeFromThreadDto,
  ) {
    return this.service.acceptIntakeFromThread(user, threadId, dto);
  }

  /** Mock-provider hook: simulates a client reply landing on an existing thread. */
  @Post('threads/:threadId/mock-reply')
  recordMockReply(
    @CurrentUser() user: AuthUser,
    @Param('threadId') threadId: string,
    @Body() dto: SeedMockReplyDto,
  ) {
    // A fake client email must never be creatable on a real system.
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.service.recordReply(user, threadId, dto);
  }

  @Post('intakes/:intakeId/field-proposals/:proposalId')
  resolveFieldProposal(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: ResolveFieldProposalDto,
  ) {
    return this.service.resolveFieldProposal(user, intakeId, proposalId, dto);
  }
}
