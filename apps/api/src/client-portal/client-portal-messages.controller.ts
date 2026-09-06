import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { CaseMessageService } from '../cases/case-message.service';
import { CreateCaseMessageDto } from '../cases/dto/case-message.dto';

@Controller('client-portal/cases/:caseId/messages')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalMessagesController {
  constructor(private readonly messages: CaseMessageService) {}

  @Get()
  list(@CurrentPortalUser() portalUser: PortalIdentity, @Param('caseId') caseId: string) {
    return this.messages.listForPortal(portalUser, caseId);
  }

  @Post()
  create(
    @CurrentPortalUser() portalUser: PortalIdentity,
    @Param('caseId') caseId: string,
    @Body() dto: CreateCaseMessageDto,
  ) {
    return this.messages.createFromPortal(portalUser, caseId, dto.body);
  }
}
