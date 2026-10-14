import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { EmailTemplatesService } from './email-templates.service';

const NOT_BLANK = /\S/;
const BLANK_MSG = 'ห้ามเว้นว่าง';

class CreateEmailTemplateDto {
  @IsString() @MaxLength(100) @Matches(NOT_BLANK, { message: BLANK_MSG }) name!: string;
  @IsString() @MaxLength(255) @Matches(NOT_BLANK, { message: BLANK_MSG }) subject!: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) @Matches(NOT_BLANK, { message: BLANK_MSG }) body!: string;
}

class UpdateEmailTemplateDto {
  @IsOptional() @IsString() @MaxLength(100) @Matches(NOT_BLANK, { message: BLANK_MSG }) name?: string;
  @IsOptional() @IsString() @MaxLength(255) @Matches(NOT_BLANK, { message: BLANK_MSG }) subject?: string;
  @IsOptional() @IsString() @MaxLength(20000) @Matches(NOT_BLANK, { message: BLANK_MSG }) body?: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class EmailTemplatesController {
  constructor(private service: EmailTemplatesService) {}

  @Get('email-templates')
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.firmId);
  }

  // Declared before ':id' routes so the literal path is never read as an id.
  @Get('email-templates/variables')
  variables() {
    return this.service.variables();
  }

  @Post('email-templates')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmailTemplateDto) {
    return this.service.create(user, dto);
  }

  @Patch('email-templates/:id')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.service.update(user, id, dto);
  }

  @Delete('email-templates/:id')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('manageFirmContent')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  @Get('cases/:caseId/email-templates/:id/render')
  @UseGuards(CaseAccessGuard)
  render(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('id') id: string) {
    return this.service.render(user, caseId, id);
  }
}
