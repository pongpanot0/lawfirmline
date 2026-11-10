import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PleadingDraftService } from './pleading-draft.service';
import { CreatePleadingDraftDto, UpdatePleadingDraftDto } from './dto/pleading-draft.dto';

@Controller('cases/:caseId/pleading-drafts')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class PleadingDraftController {
  constructor(private pleadingDrafts: PleadingDraftService) {}

  @Post()
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
