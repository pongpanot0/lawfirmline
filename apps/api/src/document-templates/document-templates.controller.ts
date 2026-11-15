import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { DocumentTemplatesService } from './document-templates.service';
import { CreateDocumentTemplateDto, ResolveTemplateDto, TemplateQueryDto, UpdateDocumentTemplateDto } from './dto/document-templates.dto';

@Controller('document-templates')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@RequireCapability('manageInvoices')
export class DocumentTemplatesController {
  constructor(private templates: DocumentTemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: TemplateQueryDto) { return this.templates.list(user, query.docType); }

  @Get('resolve')
  resolve(@CurrentUser() user: AuthUser, @Query() query: ResolveTemplateDto) { return this.templates.resolve(user, query.docType, query.customerId); }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.templates.get(user, id); }

  @Post()
  @RequireCapability('manageSubscription')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentTemplateDto) { return this.templates.create(user, dto); }

  @Patch(':id')
  @RequireCapability('manageSubscription')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentTemplateDto) { return this.templates.update(user, id, dto); }

  @Post(':id/archive')
  @RequireCapability('manageSubscription')
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.templates.archive(user, id); }
}
