import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { DocumentPublicationService } from './document-publication.service';
import { PublishDocumentDto } from './dto/publish-document.dto';

@Controller('cases/:caseId/documents/:documentId/publications')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class DocumentPublicationController {
  constructor(private readonly publicationService: DocumentPublicationService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.publicationService.listForDocument(user, caseId, documentId);
  }

  @Post()
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  publish(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Body() dto: PublishDocumentDto,
  ) {
    return this.publicationService.publish(user, caseId, documentId, dto);
  }

  @Delete(':publicationId')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Param('publicationId') publicationId: string,
  ) {
    return this.publicationService.unpublish(user, caseId, documentId, publicationId);
  }
}
