import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { EmailIntakeService } from './email-intake.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AcceptIntakeFromThreadDto, ResolveFieldProposalDto, SeedMockReplyDto } from './dto/email-intake.dto';

@Controller('email-intake')
@UseGuards(JwtAuthGuard)
export class EmailIntakeController {
  constructor(private service: EmailIntakeService) {}

  @Get('threads')
  listThreads(@CurrentUser() user: AuthUser) {
    return this.service.listThreads(user);
  }

  @Get('threads/:threadId')
  getThread(@CurrentUser() user: AuthUser, @Param('threadId') threadId: string) {
    return this.service.getThread(user, threadId);
  }

  @Post('threads/:threadId/accept')
  acceptIntakeFromThread(
    @CurrentUser() user: AuthUser,
    @Param('threadId') threadId: string,
    @Body() dto: AcceptIntakeFromThreadDto,
  ) {
    return this.service.acceptIntakeFromThread(user, threadId, dto);
  }

  /** Mock-provider hook: simulates a client reply landing on an existing thread. */
  @Post('threads/:threadId/mock-reply')
  recordMockReply(
    @CurrentUser() user: AuthUser,
    @Param('threadId') threadId: string,
    @Body() dto: SeedMockReplyDto,
  ) {
    return this.service.recordReply(user, threadId, dto);
  }

  @Post('intakes/:intakeId/field-proposals/:proposalId')
  resolveFieldProposal(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('proposalId') proposalId: string,
    @Body() dto: ResolveFieldProposalDto,
  ) {
    return this.service.resolveFieldProposal(user, intakeId, proposalId, dto);
  }
}
