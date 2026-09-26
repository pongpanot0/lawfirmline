import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthUser, CARGO_CLAIM_PLAYBOOK_KEY, CaseStage } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PracticeSetupService } from './practice-setup.service';
class ImportRowDto { @IsString() @MaxLength(200) clientName!: string; @IsString() @MaxLength(100) caseRef!: string; @IsString() @MaxLength(300) caseTitle!: string; }
class ImportDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows!: ImportRowDto[]; }
class StepDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) instructions?: string;
  @IsOptional() @IsIn(['OWNER', 'SENIOR_LAWYER', 'LAWYER', 'ASSISTANT']) primaryRole?: 'OWNER' | 'SENIOR_LAWYER' | 'LAWYER' | 'ASSISTANT';
  @IsOptional() @IsIn(['OWNER', 'SENIOR_LAWYER', 'LAWYER', 'ASSISTANT']) secondaryRole?: 'OWNER' | 'SENIOR_LAWYER' | 'LAWYER' | 'ASSISTANT';
  @IsOptional() @IsEnum(CaseStage) stage?: CaseStage;
  @IsOptional() @IsInt() @Min(0) @Max(365) offsetDays?: number;
  @IsOptional() @IsIn(['CALENDAR', 'BUSINESS']) dayBasis?: 'CALENDAR' | 'BUSINESS';
}
class CargoRequirementDto {
  @IsString() @MaxLength(100) code!: string;
  @IsString() @MaxLength(300) label!: string;
  @IsBoolean() requiredByDefault!: boolean;
}
class CargoTemplateDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => CargoRequirementDto)
  requirements!: CargoRequirementDto[];
}
class ReleaseDto {
  @IsString() @MaxLength(150) name!: string;
  @IsOptional() @IsUUID() caseTypeId?: string;
  @IsOptional() @IsIn([CARGO_CLAIM_PLAYBOOK_KEY]) templateKey?: string;
  @IsOptional() @ValidateNested() @Type(() => CargoTemplateDto) cargoTemplate?: CargoTemplateDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StepDto) steps!: StepDto[];
}
class ApplyDto { @IsUUID() releaseId!: string; }
class StageTaskItemDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() dueDate?: string | null;
  @IsOptional() @IsUUID() assigneeId?: string | null;
}
class CreateStageTasksDto {
  @IsEnum(CaseStage) stage!: CaseStage;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => StageTaskItemDto)
  tasks!: StageTaskItemDto[];
}
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
  @Get('cases/:caseId/stage-tasks')
  @UseGuards(CaseAccessGuard)
  proposeStageTasks(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) id: string, @Query('stage') stage: CaseStage) {
    return this.service.proposeStageTasks(u, id, stage);
  }
  @Post('cases/:caseId/stage-tasks')
  @UseGuards(CaseAccessGuard)
  createStageTasks(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) id: string, @Body() dto: CreateStageTasksDto) {
    return this.service.createStageTasks(u, id, dto.stage, dto.tasks);
  }
}
