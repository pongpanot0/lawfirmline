import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { OwnerOnly } from '../saas/decorators/saas.decorators';

class TemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsString() @IsNotEmpty() @MaxLength(100000) templateBody!: string;
  @IsOptional() @IsUUID() caseTypeId?: string;
}

class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(100000) templateBody?: string;
  @IsOptional() @IsUUID() caseTypeId?: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get('document-templates')
  findAll(@CurrentUser() user: AuthUser, @Query('caseTypeId') caseTypeId?: string) {
    return this.templatesService.findAll(user.firmId, caseTypeId);
  }

  @Post('document-templates')
  @UseGuards(FirmRoleGuard)
  @OwnerOnly()
  create(@CurrentUser() user: AuthUser, @Body() dto: TemplateDto) {
    return this.templatesService.create(user.firmId, dto);
  }

  @Patch('document-templates/:id')
  @UseGuards(FirmRoleGuard)
  @OwnerOnly()
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(user.firmId, id, dto);
  }

  @Delete('document-templates/:id')
  @UseGuards(FirmRoleGuard)
  @OwnerOnly()
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.templatesService.remove(user.firmId, id);
  }

  @Get('cases/:caseId/document-templates/:templateId/render')
  @UseGuards(CaseAccessGuard)
  render(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.templatesService.render(user.firmId, templateId, caseId);
  }

  @Post('cases/:caseId/document-templates/:templateId/generate')
  @UseGuards(CaseAccessGuard)
  generate(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.templatesService.generate(user, caseId, templateId);
  }
}
