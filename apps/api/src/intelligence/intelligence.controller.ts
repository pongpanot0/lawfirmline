import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeCategory } from '@lawfirm/shared';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCredits } from '../common/decorators/require-credits.decorator';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { AuthUser } from '@lawfirm/shared';

@Controller()
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(private intelligenceService: DocumentIntelligenceService) {}

  @Get('knowledge')
  findKnowledge(
    @Query('caseId') caseId?: string,
    @Query('category') category?: KnowledgeCategory,
    @Query('search') search?: string,
  ) {
    return this.intelligenceService.findKnowledge(caseId, category, search);
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
}
