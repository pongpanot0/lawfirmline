import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AuthUser, CourtFollowUpKind } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CourtWorkflowService } from './court-workflow.service';
import {
  CreateAnswerExtensionDto,
  RecordCourtFollowUpDto,
  SetAnswerDeadlineDto,
  UpdateAnswerExtensionDto,
} from './dto/court-workflow.dto';

@Controller('cases/:caseId')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CourtWorkflowController {
  constructor(private workflow: CourtWorkflowService) {}

  @Get('follow-ups')
  listFollowUps(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.workflow.listFollowUps(user, caseId);
  }

  @Post('follow-ups/:kind/result')
  recordFollowUp(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('kind', new ParseEnumPipe(CourtFollowUpKind)) kind: CourtFollowUpKind,
    @Body() dto: RecordCourtFollowUpDto,
  ) {
    return this.workflow.recordFollowUpResult(user, caseId, kind, dto);
  }

  @Get('answer-deadline')
  getAnswerDeadline(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.workflow.getAnswerDeadline(user, caseId);
  }

  @Put('answer-deadline')
  setAnswerDeadline(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: SetAnswerDeadlineDto) {
    return this.workflow.setAnswerDeadline(user, caseId, dto.answerDueAt);
  }

  @Post('answer-extensions')
  createAnswerExtension(
    @CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: CreateAnswerExtensionDto,
  ) {
    return this.workflow.createAnswerExtension(user, caseId, dto);
  }

  @Patch('answer-extensions/:extId')
  updateAnswerExtension(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('extId') extId: string,
    @Body() dto: UpdateAnswerExtensionDto,
  ) {
    return this.workflow.updateAnswerExtension(user, caseId, extId, dto);
  }
}
