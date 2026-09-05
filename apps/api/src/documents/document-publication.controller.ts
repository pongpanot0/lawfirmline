import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role } from '@lawfirm/shared';
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
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  publish(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Body() dto: PublishDocumentDto,
  ) {
    return this.publicationService.publish(user, caseId, documentId, dto);
  }

  @Delete(':publicationId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Param('publicationId') publicationId: string,
  ) {
    return this.publicationService.unpublish(user, caseId, documentId, publicationId);
  }
}
