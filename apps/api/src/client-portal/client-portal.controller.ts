import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ClientPortalService } from './client-portal.service';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { buildContentDispositionHeader } from '../common/utils/sanitize-filename';
import { safeMimeType } from '../common/utils/safe-mime-type';
import { FileStorageService } from '../common/services/file-storage.service';

@Controller('client-portal')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalController {
  constructor(
    private portalService: ClientPortalService,
    private fileStorage: FileStorageService,
  ) {}

  @Get('me')
  getMe(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.portalService.getMe(portalUser);
  }

  @Get('dashboard')
  getDashboardSummary(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.portalService.getDashboardSummary(portalUser);
  }

  @Get('cases')
  getCases(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.portalService.getCases(portalUser);
  }

  @Get('cases/:id')
  getCase(@CurrentPortalUser() portalUser: PortalIdentity, @Param('id') id: string) {
    return this.portalService.getCase(portalUser, id);
  }

  @Get('documents/:documentId/download')
  async download(
    @CurrentPortalUser() portalUser: PortalIdentity,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const fileInfo = await this.portalService.getVisibleDocumentFile(portalUser, documentId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', safeMimeType(fileInfo.mimeType));
    res.setHeader('Content-Disposition', buildContentDispositionHeader(fileInfo.filename));
    const stream = await this.fileStorage.openDownloadStream(fileInfo.path);
    stream.pipe(res);
  }
}
