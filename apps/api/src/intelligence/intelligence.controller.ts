import { BatchAnalysisDto } from './dto/batch-analysis.dto';
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Body,
} from '@nestjs/common';
import * as fs from 'fs';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { KnowledgeCategory } from '@lawfirm/shared';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DocumentsService } from '../documents/documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCredits } from '../common/decorators/require-credits.decorator';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { AuthUser } from '@lawfirm/shared';

@Controller()
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(
    private intelligenceService: DocumentIntelligenceService,
    private documentsService: DocumentsService,
  ) {}

  @Get('cases/:caseId/knowledge')
  @UseGuards(CaseAccessGuard)
  findCaseKnowledge(@Param('caseId') caseId: string) {
    return this.intelligenceService.findKnowledge(caseId);
  }

  @Get('knowledge')
  findKnowledge(
    @Query('caseId') caseId?: string,
    @Query('category') category?: KnowledgeCategory,
    @Query('search') search?: string,
  ) {
    return this.intelligenceService.findKnowledge(caseId, category, search);
  }

  @Post('documents/analyze-batch')
  @RequireCredits(5)
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024, files: 10 } }), AiCreditsInterceptor)
  analyzeDraftBatch(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
    return this.intelligenceService.analyzeBatch((files ?? []).map((file) => ({ buffer: file.buffer, mimeType: file.mimetype, filename: file.originalname })), user.id);
  }

  @Get('cases/:caseId/documents/batch-analyses')
  @UseGuards(CaseAccessGuard)
  listBatchAnalyses(@Param('caseId') caseId: string) {
    return this.intelligenceService.listBatchAnalyses(caseId);
  }

  @Post('cases/:caseId/documents/analyze-batch')
  @UseGuards(CaseAccessGuard)
  @RequireCredits(5)
  @UseInterceptors(AiCreditsInterceptor)
  async analyzeExistingBatch(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: BatchAnalysisDto) {
    // Resolve all files within this authorized case before reading any content.
    const paths = await Promise.all(dto.documentIds.map((id) => this.documentsService.getFilePath(caseId, id)));
    const files = await Promise.all(paths.map(async (file) => ({ buffer: await fs.promises.readFile(file.path), mimeType: file.mimeType, filename: file.filename })));
    return this.intelligenceService.analyzeBatch(files, user.id, caseId);
  }

  @Post('cases/:caseId/documents/analyze')
  @UseGuards(CaseAccessGuard)
  @RequireCredits(5)
  @UseInterceptors(FileInterceptor('file'), AiCreditsInterceptor)
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
  @UseGuards(CaseAccessGuard)
  @RequireCredits(5)
  @UseInterceptors(FileInterceptor('file'), AiCreditsInterceptor)
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
  @UseGuards(CaseAccessGuard)
  @RequireCredits(5)
  @UseInterceptors(AiCreditsInterceptor)
  async analyzeExisting(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const file = await this.documentsService.getFilePath(caseId, documentId);
    const buffer = fs.readFileSync(file.path);
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
  @UseGuards(CaseAccessGuard)
  @RequireCredits(5)
  @UseInterceptors(AiCreditsInterceptor)
  async extractDatesExisting(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const file = await this.documentsService.getFilePath(caseId, documentId);
    const buffer = fs.readFileSync(file.path);
    return this.intelligenceService.extractDates(
      buffer,
      file.mimeType,
      caseId,
      user.id,
      documentId,
    );
  }
}
