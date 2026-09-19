import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { AI_CREDIT_COST, AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCredits } from '../common/decorators/require-credits.decorator';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { LegalService } from './legal.service';
import { AskLegalDto } from './dto/ask-legal.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class LegalController {
  constructor(private legalService: LegalService) {}

  @Post('cases/:caseId/legal/ask')
  @UseGuards(CaseAccessGuard)
  @RequireCredits(AI_CREDIT_COST.LEGAL_ASK)
  @UseInterceptors(AiCreditsInterceptor)
  ask(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: AskLegalDto) {
    return this.legalService.ask(user.id, caseId, dto.question, dto.citationIds);
  }

  @Get('cases/:caseId/legal')
  @UseGuards(CaseAccessGuard)
  list(@Param('caseId') caseId: string) {
    return this.legalService.list(caseId);
  }
}
