import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PracticeSetupService } from './practice-setup.service';
class ImportRowDto { @IsString() @MaxLength(200) clientName!: string; @IsString() @MaxLength(100) caseRef!: string; @IsString() @MaxLength(300) caseTitle!: string; }
class ImportDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows!: ImportRowDto[]; }
class StepDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) instructions?: string;
  @IsOptional() @IsIn(['OWNER', 'SENIOR_LAWYER', 'LAWYER', 'ASSISTANT']) primaryRole?: 'OWNER' | 'SENIOR_LAWYER' | 'LAWYER' | 'ASSISTANT';
  @IsOptional() @IsIn(['OWNER', 'SENIOR_LAWYER', 'LAWYER', 'ASSISTANT']) secondaryRole?: 'OWNER' | 'SENIOR_LAWYER' | 'LAWYER' | 'ASSISTANT';
}
class ReleaseDto { @IsString() @MaxLength(150) name!: string; @IsOptional() @IsUUID() caseTypeId?: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StepDto) steps!: StepDto[]; }
class ApplyDto { @IsUUID() releaseId!: string; }
@Controller('practice-setup')
@UseGuards(JwtAuthGuard)
export class PracticeSetupController {
  constructor(private service: PracticeSetupService) {}
  @Get('progress') progress(@CurrentUser() u: AuthUser) { return this.service.progress(u); }
  @Post('imports/preview') preview(@CurrentUser() u: AuthUser, @Body() dto: ImportDto) { return this.service.previewImport(u, dto.rows); }
  @Post('imports/:id/commit') commit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.commitImport(u, id); }
  @Post('imports/:id/undo') undo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.undoImport(u, id); }
  @Get('playbooks') list(@CurrentUser() u: AuthUser) { return this.service.listPlaybooks(u); }
  @Post('playbooks') publish(@CurrentUser() u: AuthUser, @Body() dto: ReleaseDto) { return this.service.publish(u, { ...dto, steps: dto.steps.map((s) => ({ ...s, instructions: s.instructions ?? '' })) }); }
  @Post('cases/:caseId/preview') previewPlaybook(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) id: string, @Body() dto: ApplyDto) { return this.service.previewPlaybook(u, id, dto.releaseId); }
  @Post('cases/:caseId/apply') apply(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) id: string, @Body() dto: ApplyDto) { return this.service.applyPlaybook(u, id, dto.releaseId); }
}
