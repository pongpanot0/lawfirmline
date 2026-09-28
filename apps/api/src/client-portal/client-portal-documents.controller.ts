import { Body, Controller, Get, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ClientPortalDocumentsService } from './client-portal-documents.service';
import { UploadPortalCaseDocumentDto } from './dto/portal-case-document.dto';
import { PORTAL_UPLOAD_LIMITS } from './portal-case-helpers';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { FileStorageService } from '../common/services/file-storage.service';

@Controller('client-portal/cases/:caseId/documents')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalDocumentsController {
  constructor(
    private readonly portalDocuments: ClientPortalDocumentsService,
    private readonly fileStorage: FileStorageService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: PORTAL_UPLOAD_LIMITS }))
  upload(
    @CurrentPortalUser() user: PortalIdentity,
    @Param('caseId') caseId: string,
    @Body() dto: UploadPortalCaseDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.portalDocuments.uploadToCase(user, caseId, dto, file);
  }

  @Get(':documentId/file')
  async downloadClientUpload(
    @CurrentPortalUser() user: PortalIdentity,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const file = await this.portalDocuments.getClientUploadFile(user, caseId, documentId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(file.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(file.filename));
    const stream = await this.fileStorage.openDownloadStream(file.path);
    stream.pipe(res);
  }
}
