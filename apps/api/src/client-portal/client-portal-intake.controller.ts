import { Body, Controller, Get, Param, Post, Res, UseGuards, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';
import { mapInternalStatusToExternal } from '../intake/intake-status-mapping';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';

@Controller('client-portal/intake')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalIntakeController {
  constructor(private readonly intakeService: ClientPortalIntakeService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 20 * 1024 * 1024 } }))
  submit(
    @CurrentPortalUser() user: PortalIdentity,
    @Body() dto: SubmitPortalIntakeDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.intakeService.submit(user, dto, files);
  }

  @Get()
  async listMine(@CurrentPortalUser() user: PortalIdentity) {
    const submissions = await this.intakeService.listMine(user);
    return submissions.map((s) => ({
      id: s.id,
      referenceNumber: s.referenceNumber,
      title: s.title,
      submittedAt: s.submittedAt,
      withdrawnByClient: s.withdrawnByClient,
      externalStatus: s.intake ? mapInternalStatusToExternal(s.intake) : 'ส่งแล้ว',
      attachments: s.attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.size })),
    }));
  }

  @Get(':submissionId/attachments/:attachmentId/download')
  async downloadAttachment(
    @CurrentPortalUser() user: PortalIdentity,
    @Param('submissionId') submissionId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const file = await this.intakeService.getAttachmentFile(user, submissionId, attachmentId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(file.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(file.filename));
    fs.createReadStream(file.path).pipe(res);
  }
}
