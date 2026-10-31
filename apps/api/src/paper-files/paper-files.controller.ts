import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { AuthUser, PaperFileAction } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { PaperFilesService } from './paper-files.service';

export class PaperFileActionDto {
  @IsEnum(PaperFileAction, { message: 'ประเภทการเบิกคืนสำนวนไม่ถูกต้อง' })
  action!: PaperFileAction;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'กรุณาเลือกผู้ถือสำนวน' })
  holderUserId?: string;

  @ValidateIf((dto, value) => dto.action !== PaperFileAction.CHECK_OUT || value !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'กรุณาระบุที่เก็บสำนวน' })
  @MaxLength(500)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CheckedOutQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class PaperFilesController {
  constructor(private paperFiles: PaperFilesService) {}

  @Get('cases/:caseId/paper-file')
  @UseGuards(CaseAccessGuard)
  history(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.paperFiles.history(user, caseId);
  }

  @Post('cases/:caseId/paper-file')
  @UseGuards(CaseAccessGuard)
  act(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: PaperFileActionDto) {
    switch (dto.action) {
      case PaperFileAction.CHECK_OUT:
        return this.paperFiles.checkOut(user, caseId, dto);
      case PaperFileAction.CHECK_IN:
        return this.paperFiles.checkIn(user, caseId, { ...dto, location: dto.location! });
      case PaperFileAction.MOVE:
        return this.paperFiles.move(user, caseId, { ...dto, location: dto.location! });
    }
  }

  @Get('paper-files/by-folder/:folderId')
  resolveFolder(@CurrentUser() user: AuthUser, @Param('folderId') folderId: string) {
    return this.paperFiles.resolveFolder(user, folderId);
  }

  @Get('paper-files/checked-out')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('runOperations')
  listCheckedOut(@CurrentUser() user: AuthUser, @Query() query: CheckedOutQueryDto) {
    return this.paperFiles.listCheckedOut(user, query);
  }
}
