import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PracticeSetupService } from './practice-setup.service';
class ImportRowDto { @IsString() @MaxLength(200) clientName!: string; @IsString() @MaxLength(100) caseRef!: string; @IsString() @MaxLength(300) caseTitle!: string; }
class ImportDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows!: ImportRowDto[]; }
class StepDto { @IsString() @MaxLength(200) title!: string; @IsString() @MaxLength(5000) instructions!: string; @IsInt() @Min(0) @Max(365) days!: number; @IsIn(['TASK', 'DOCUMENT', 'APPROVAL']) kind!: 'TASK' | 'DOCUMENT' | 'APPROVAL'; @IsOptional() @IsInt() @Min(0) @Max(49) parentIndex?: number; }
class ReleaseDto { @IsString() @MaxLength(150) name!: string; @IsIn(['GENERAL', 'MEDICAL', 'TRANSPORT']) workType!: string; @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StepDto) steps!: StepDto[]; }
class ApplyDto { @IsUUID() releaseId!: string; @IsDateString() startDate!: string; }
@Controller('practice-setup')
@UseGuards(JwtAuthGuard)
export class PracticeSetupController {
  constructor(private service: PracticeSetupService) {}
  @Get('progress') progress(@CurrentUser() u: AuthUser) { return this.service.progress(u); }
  @Post('imports/preview') preview(@CurrentUser() u: AuthUser, @Body() dto: ImportDto) { return this.service.previewImport(u, dto.rows); }
  @Post('imports/:id/commit') commit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.commitImport(u, id); }
  @Post('imports/:id/undo') undo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.undoImport(u, id); }
  @Get('playbooks') list(@CurrentUser() u: AuthUser) { return this.service.listPlaybooks(u); }
  @Post('playbooks') publish(@CurrentUser() u: AuthUser, @Body() dto: ReleaseDto) { return this.service.publish(u, dto); }
  @Post('cases/:caseId/preview') previewPlaybook(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) id: string, @Body() dto: ApplyDto) { return this.service.previewPlaybook(u, id, dto.releaseId, dto.startDate); }
  @Post('cases/:caseId/apply') apply(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) id: string, @Body() dto: ApplyDto) { return this.service.applyPlaybook(u, id, dto.releaseId, dto.startDate); }
}
