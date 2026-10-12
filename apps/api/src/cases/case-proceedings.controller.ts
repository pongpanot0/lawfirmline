import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser, CourtLevel } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CaseProceedingsService } from './case-proceedings.service';
import {
  RecordAppealServedDto,
  RecordFilingDto,
  RecordJudgmentDto,
  RecordServiceDto,
  UpdateProceedingDto,
} from './dto/proceeding.dto';

@Controller('cases/:caseId/proceedings')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseProceedingsController {
  constructor(private proceedings: CaseProceedingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.proceedings.list(user, caseId);
  }

  @Post('filing')
  filing(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordFilingDto) {
    return this.proceedings.recordFiling(user, caseId, dto);
  }

  @Post('service')
  service(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordServiceDto) {
    return this.proceedings.recordService(user, caseId, dto);
  }

  @Post('judgment')
  judgment(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordJudgmentDto) {
    return this.proceedings.recordJudgment(user, caseId, dto);
  }

  @Post('appeal-served')
  appealServed(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: RecordAppealServedDto) {
    return this.proceedings.recordAppealServed(user, caseId, dto);
  }

  @Patch(':courtLevel')
  update(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('courtLevel', new ParseEnumPipe(CourtLevel)) courtLevel: CourtLevel,
    @Body() dto: UpdateProceedingDto,
  ) {
    return this.proceedings.update(user, caseId, courtLevel, dto);
  }
}
