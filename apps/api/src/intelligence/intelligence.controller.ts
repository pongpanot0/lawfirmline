import { BatchAnalysisDto } from './dto/batch-analysis.dto';
import { decodeUploadFilename } from '../common/utils/decode-upload-filename';
import { ClassifyChecklistDto } from './dto/classify-checklist.dto';
import { ReviewKnowledgeDto } from './dto/review-knowledge.dto';
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { KnowledgeCategory } from '@lawfirm/shared';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DocumentsService } from '../documents/documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { AiAction } from '../common/decorators/ai-action.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(
    private intelligenceService: DocumentIntelligenceService,
    private documentsService: DocumentsService,
    private caseAccess: CaseAccessService,
    private fileStorage: FileStorageService,
  ) {}

  @Get('cases/:caseId/knowledge')
  @UseGuards(CaseAccessGuard)
  findCaseKnowledge(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.intelligenceService.findKnowledge(this.caseAccess.getCaseFilterForUser(user), caseId);
  }

  @Patch('cases/:caseId/knowledge/:id')
  @UseGuards(CaseAccessGuard)
  reviewKnowledge(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() dto: ReviewKnowledgeDto,
  ) {
    return this.intelligenceService.reviewKnowledge(caseId, id, user.id, dto.summary);
  }

  @Get('knowledge')
  findKnowledge(
    @CurrentUser() user: AuthUser,
    @Query('caseId') caseId?: string,
    @Query('category') category?: KnowledgeCategory,
    @Query('search') search?: string,
  ) {
    return this.intelligenceService.findKnowledge(this.caseAccess.getCaseFilterForUser(user), caseId, category, search);
  }

  @Post('documents/analyze-batch')
  @AiAction('intelligence-documents-analyze-batch')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 30 * 1024 * 1024, files: 10 } }))
  analyzeDraftBatch(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
    return this.intelligenceService.analyzeBatch((files ?? []).map((file) => ({ buffer: file.buffer, mimeType: file.mimetype, filename: decodeUploadFilename(file.originalname) })), user.id);
  }

  @Get('cases/:caseId/documents/batch-analyses')
  @UseGuards(CaseAccessGuard)
  listBatchAnalyses(@Param('caseId') caseId: string) {
    return this.intelligenceService.listBatchAnalyses(caseId);
  }

  @Post('cases/:caseId/documents/analyze-batch')
  @AiAction('intelligence-cases-caseid-documents-analyze-batch')
  @UseGuards(CaseAccessGuard)
  async analyzeExistingBatch(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: BatchAnalysisDto) {
    // Resolve all files within this authorized case before reading any content.
    const paths = await Promise.all(dto.documentIds.map((id) => this.documentsService.getFilePath(user, caseId, id)));
    const files = await Promise.all(paths.map(async (file) => ({ buffer: await this.fileStorage.getBuffer(file.path), mimeType: file.mimeType, filename: file.filename })));
    return this.intelligenceService.analyzeBatch(files, user.id, caseId);
  }

  @Post('cases/:caseId/documents/classify-checklist')
  @UseGuards(CaseAccessGuard)
  async classifyCaseChecklist(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: ClassifyChecklistDto,
  ) {
    const files = await Promise.all(
      dto.documentIds.map(async (documentId) => {
        const file = await this.documentsService.getFilePath(user, caseId, documentId);
        return {
          documentId,
          filename: file.filename,
          mimeType: file.mimeType,
          buffer: await this.fileStorage.getBuffer(file.path),
        };
      }),
    );
    return this.intelligenceService.classifyChecklistDocuments(files, dto.labels);
  }

  @Post('intake/:intakeId/documents/analyze-batch')
  @AiAction('intelligence-intake-intakeid-documents-analyze-batch')
  async analyzeIntakeBatch(@CurrentUser() user: AuthUser, @Param('intakeId') intakeId: string, @Body() dto: BatchAnalysisDto) {
    // Resolve every file within this authorized intake before reading content.
    const paths = await Promise.all(dto.documentIds.map((id) => this.documentsService.getFilePathForIntake(user, intakeId, id)));
    const files = await Promise.all(paths.map(async (file) => ({ buffer: await this.fileStorage.getBuffer(file.path), mimeType: file.mimeType, filename: file.filename })));
    // No caseId yet — the result is returned for reading, and the documents
    // follow the intake into the case where the full knowledge flow lives.
    return this.intelligenceService.analyzeBatch(files, user.id);
  }

  @Post('intake/:intakeId/documents/classify-checklist')
  async classifyIntakeChecklist(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Body() dto: ClassifyChecklistDto,
  ) {
    const files = await Promise.all(
      dto.documentIds.map(async (documentId) => {
        const file = await this.documentsService.getFilePathForIntake(user, intakeId, documentId);
        return {
          documentId,
          filename: file.filename,
          mimeType: file.mimeType,
          buffer: await this.fileStorage.getBuffer(file.path),
        };
      }),
    );
    return this.intelligenceService.classifyChecklistDocuments(files, dto.labels);
  }

  @Post('cases/:caseId/documents/analyze')
  @AiAction('intelligence-cases-caseid-documents-analyze')
  @UseGuards(CaseAccessGuard)
  @UseInterceptors(FileInterceptor('file'))
  analyze(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('title') title?: string,
    @Query('documentId') documentId?: string,
  ) {
    return this.intelligenceService.analyzeDocument(
      file.buffer,
      file.mimetype,
      caseId,
      user.id,
      documentId,
      title,
    );
  }

  @Post('cases/:caseId/documents/extract-dates')
  @AiAction('intelligence-cases-caseid-documents-extract-dates')
  @UseGuards(CaseAccessGuard)
  @UseInterceptors(FileInterceptor('file'))
  extractDates(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('documentId') documentId?: string,
  ) {
    return this.intelligenceService.extractDates(
      file.buffer,
      file.mimetype,
      caseId,
      user.id,
      documentId,
    );
  }

  @Post('cases/:caseId/documents/:documentId/analyze')
  @AiAction('intelligence-cases-caseid-documents-documentid-analyze')
  @UseGuards(CaseAccessGuard)
  async analyzeExisting(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const file = await this.documentsService.getFilePath(user, caseId, documentId);
    const buffer = await this.fileStorage.getBuffer(file.path);
    return this.intelligenceService.analyzeDocument(
      buffer,
      file.mimeType,
      caseId,
      user.id,
      documentId,
      file.filename,
    );
  }

  @Post('cases/:caseId/documents/:documentId/extract-dates')
  @AiAction('intelligence-cases-caseid-documents-documentid-extract-dates')
  @UseGuards(CaseAccessGuard)
  async extractDatesExisting(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const file = await this.documentsService.getFilePath(user, caseId, documentId);
    const buffer = await this.fileStorage.getBuffer(file.path);
    return this.intelligenceService.extractDates(
      buffer,
      file.mimeType,
      caseId,
      user.id,
      documentId,
    );
  }
}
