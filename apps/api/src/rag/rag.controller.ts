import { Body, Controller, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { AI_CREDIT_COST, AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCredits } from '../common/decorators/require-credits.decorator';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { RagService } from './rag.service';
import { AskCaseDto } from './dto/ask-case.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private ragService: RagService) {}

  @Post('cases/:caseId/ai/ask')
  @UseGuards(CaseAccessGuard)
  @RequireCredits(AI_CREDIT_COST.RAG_QA)
  @UseInterceptors(AiCreditsInterceptor)
  ask(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: AskCaseDto) {
    return this.ragService.ask(user.id, caseId, dto.question);
  }

  @Post('cases/:caseId/rag/reindex')
  @UseGuards(CaseAccessGuard)
  reindex(@Param('caseId') caseId: string) {
    return this.ragService.reindexCase(caseId);
  }
}
