import { Body, Controller, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { AI_CREDIT_COST, AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCredits } from '../common/decorators/require-credits.decorator';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { PleadingDraftService } from './pleading-draft.service';
import { CreatePleadingDraftDto, UpdatePleadingDraftDto } from './dto/pleading-draft.dto';

@Controller('cases/:caseId/pleading-drafts')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class PleadingDraftController {
  constructor(private pleadingDrafts: PleadingDraftService) {}

  @Post()
  @RequireCredits(AI_CREDIT_COST.DRAFT_PLEADING)
  @UseInterceptors(AiCreditsInterceptor)
  generate(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Body() dto: CreatePleadingDraftDto) {
    return this.pleadingDrafts.generate(user, caseId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.pleadingDrafts.list(user, caseId);
  }

  @Patch(':draftId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('draftId') draftId: string,
    @Body() dto: UpdatePleadingDraftDto,
  ) {
    return this.pleadingDrafts.update(user, caseId, draftId, dto.bodyText);
  }

  @Post(':draftId/approve')
  approve(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string, @Param('draftId') draftId: string) {
    return this.pleadingDrafts.approve(user, caseId, draftId);
  }
}
