import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { TemplatesService } from './templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability, SkipSubscription } from '../saas/decorators/saas.decorators';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';

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

class GenerateTemplateDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @IsNotEmpty() @MaxLength(100000) content?: string;
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
  @RequireCapability('manageFirmContent')
  create(@CurrentUser() user: AuthUser, @Body() dto: TemplateDto) {
    return this.templatesService.create(user.firmId, dto);
  }

  @Patch('document-templates/:id')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(user.firmId, id, dto);
  }

  @Delete('document-templates/:id')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
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
    @Body() dto: GenerateTemplateDto,
  ) {
    return this.templatesService.generate(user, caseId, templateId, dto.content);
  }
}

/** Firm case types don't exist across firms, so a built-in carries no caseTypeId. */
class BuiltInTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsString() @IsNotEmpty() @MaxLength(100000) templateBody!: string;
}

class UpdateBuiltInTemplateDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100000) templateBody?: string;
}

/** Built-in templates every firm sees — the superadmin console's master data. */
@Controller('platform/document-templates')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@SkipSubscription()
export class PlatformTemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get()
  list() {
    return this.templatesService.findBuiltIns();
  }

  @Post()
  create(@Body() dto: BuiltInTemplateDto) {
    return this.templatesService.create(null, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBuiltInTemplateDto) {
    return this.templatesService.update(null, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(null, id);
  }
}
