import { SelectedAttachmentsDto } from './dto/selected-attachments.dto';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IntakeService } from './intake.service';
import {
  CreateIntakeDto,
  UpdateIntakeDto,
  AssessIntakeDto,
  DecideIntakeDto,
  NoticeDto,
  DraftNoticeDto,
  ConvertToCaseDto,
  IntakeQueryDto,
} from './dto/intake.dto';
import { ConvertPortalSubmissionDto } from './dto/portal-submission.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCredits } from '../common/decorators/require-credits.decorator';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { AuthUser } from '@lawfirm/shared';
import { IntakePrecedentAnalysisService, PRECEDENT_ANALYSIS_COST } from './intake-precedent-analysis.service';

@Controller('intake')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntakeController {
  constructor(
    private intakeService: IntakeService,
    private precedentAnalysisService: IntakePrecedentAnalysisService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: IntakeQueryDto) {
    return this.intakeService.findAll(user, query);
  }

  @Get('portal-submissions')
  listPortalSubmissions(@CurrentUser() user: AuthUser) {
    return this.intakeService.listPortalSubmissions(user);
  }

  @Post('portal-submissions/:id/convert')
  convertPortalSubmission(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertPortalSubmissionDto,
  ) {
    return this.intakeService.convertPortalSubmission(user, id, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.intakeService.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateIntakeDto) {
    return this.intakeService.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateIntakeDto,
  ) {
    return this.intakeService.update(user, id, dto);
  }

  @Post(':id/assess')
  assess(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AssessIntakeDto,
  ) {
    return this.intakeService.assess(user, id, dto);
  }

  @Post(':id/decide')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideIntakeDto,
  ) {
    return this.intakeService.decide(user, id, dto);
  }

  @Post(':id/notice')
  issueNotice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: NoticeDto,
  ) {
    return this.intakeService.issueNotice(user, id, dto);
  }

  @Post(':id/notice/draft')
  @RequireCredits(5)
  @UseInterceptors(AiCreditsInterceptor)
  draftNotice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DraftNoticeDto,
  ) {
    return this.intakeService.draftNotice(user, id, dto.analysisId);
  }

  @Post(':id/convert')
  convertToCase(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertToCaseDto,
  ) {
    return this.intakeService.convertToCase(user, id, dto);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.intakeService.uploadAttachment(user, id, file);
  }

  @Delete(':id/attachments/:attachmentId')
  deleteAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.intakeService.deleteAttachment(user, id, attachmentId);
  }

  @Post(':id/precedent-analysis')
  @RequireCredits(PRECEDENT_ANALYSIS_COST)
  @UseInterceptors(AiCreditsInterceptor)
  runPrecedentAnalysis(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SelectedAttachmentsDto) {
    return this.precedentAnalysisService.analyze(user, id, dto?.attachmentIds);
  }

  @Get(':id/precedent-analysis')
  listPrecedentAnalyses(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.precedentAnalysisService.listForIntake(user, id);
  }

  @Get(':id/precedent-analysis/:analysisId')
  getPrecedentAnalysis(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('analysisId') analysisId: string,
  ) {
    return this.precedentAnalysisService.getOne(user, id, analysisId);
  }
}
