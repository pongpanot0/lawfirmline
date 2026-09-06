import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { CaseMessageService } from './case-message.service';
import { CreateCaseMessageDto } from './dto/case-message.dto';

@Controller('cases/:caseId/messages')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseMessageController {
  constructor(private readonly messages: CaseMessageService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.messages.listForStaff(user, caseId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateCaseMessageDto,
  ) {
    return this.messages.createFromStaff(user, caseId, dto.body);
  }
}
