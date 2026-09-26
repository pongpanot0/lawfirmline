import { Body, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ClientPortalDocumentsService } from './client-portal-documents.service';
import { UploadPortalCaseDocumentDto } from './dto/portal-case-document.dto';
import { PORTAL_UPLOAD_LIMITS } from './portal-case-helpers';

@Controller('client-portal/cases/:caseId/documents')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalDocumentsController {
  constructor(private readonly portalDocuments: ClientPortalDocumentsService) {}

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
}
