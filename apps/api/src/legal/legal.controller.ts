import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LegalService } from './legal.service';
import { AskLegalDto } from './dto/ask-legal.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class LegalController {
  constructor(private legalService: LegalService) {}

  @Post('cases/:caseId/legal/ask')
  @UseGuards(CaseAccessGuard)
  ask(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: AskLegalDto) {
    return this.legalService.ask(user.id, caseId, dto.question, dto.citationIds);
  }

  @Get('cases/:caseId/legal')
  @UseGuards(CaseAccessGuard)
  list(@Param('caseId') caseId: string) {
    return this.legalService.list(caseId);
  }
}
