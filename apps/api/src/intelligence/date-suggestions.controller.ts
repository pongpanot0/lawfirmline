import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthUser, DateSuggestionStatus } from '@lawfirm/shared';
import { DateSuggestionsService } from './date-suggestions.service';
import { ConfirmDateSuggestionDto } from './dto/date-suggestion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('cases/:caseId/date-suggestions')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class DateSuggestionsController {
  constructor(private dateSuggestions: DateSuggestionsService) {}

  @Get()
  list(@Param('caseId') caseId: string, @Query('status') status?: DateSuggestionStatus) {
    return this.dateSuggestions.listForCase(caseId, status);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: ConfirmDateSuggestionDto,
  ) {
    return this.dateSuggestions.confirm(caseId, id, user.id, body);
  }

  @Post(':id/dismiss')
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('id') id: string,
  ) {
    return this.dateSuggestions.dismiss(caseId, id, user.id);
  }
}
