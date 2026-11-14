import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RagService } from './rag.service';
import { AskCaseDto } from './dto/ask-case.dto';
import { AiAction } from '../common/decorators/ai-action.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private ragService: RagService) {}

  @Post('cases/:caseId/ai/ask')
  @AiAction('rag-cases-caseid-ai-ask')
  @UseGuards(CaseAccessGuard)
  ask(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: AskCaseDto) {
    return this.ragService.ask(user.id, caseId, dto.question, dto.documentIds);
  }

  @Get('documents/search-content')
  searchContent(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.ragService.searchDocumentsByContent(user, q ?? '');
  }

  @Post('cases/:caseId/rag/reindex')
  @AiAction('rag-cases-caseid-rag-reindex')
  @UseGuards(CaseAccessGuard)
  reindex(@Param('caseId') caseId: string) {
    return this.ragService.reindexCase(caseId);
  }
}
