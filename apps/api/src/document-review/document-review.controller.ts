import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { DocumentReviewService } from './document-review.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReviewRoundDto, ReviewDecisionDto } from './dto/document-review.dto';

@Controller('cases/:caseId/documents/:documentId/review-rounds')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class DocumentReviewController {
  constructor(private service: DocumentReviewService) {}

  @Get('eligible-members')
  listEligibleMembers(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.service.listEligibleMembers(user, caseId);
  }

  @Get()
  listForDocument(@Param('caseId') caseId: string, @Param('documentId') documentId: string) {
    return this.service.listForDocument(caseId, documentId);
  }

  @Post()
  createReviewRound(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Body() dto: CreateReviewRoundDto,
  ) {
    return this.service.createReviewRound(user, caseId, documentId, dto.documentVersionId, dto);
  }

  @Get(':roundId')
  getReviewRound(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Param('roundId') roundId: string,
  ) {
    return this.service.getReviewRound(caseId, documentId, roundId);
  }

  @Post(':roundId/decision')
  recordDecision(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Param('roundId') roundId: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.service.recordDecision(user, caseId, documentId, roundId, dto);
  }
}
