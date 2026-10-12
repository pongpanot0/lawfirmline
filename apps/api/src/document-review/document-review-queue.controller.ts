import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { DocumentReviewService } from './document-review.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/** Read-only round lists for the app (D2). Decisions stay on DocumentReviewController. */
@Controller()
@UseGuards(JwtAuthGuard)
export class DocumentReviewQueueController {
  constructor(private service: DocumentReviewService) {}

  @Get('document-review/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listMine(user);
  }

  @Get('cases/:caseId/review-rounds')
  @UseGuards(CaseAccessGuard)
  forCase(@Param('caseId') caseId: string) {
    return this.service.listForCase(caseId);
  }
}
