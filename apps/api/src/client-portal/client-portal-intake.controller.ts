import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';
import { mapInternalStatusToExternal } from '../intake/intake-status-mapping';

@Controller('client-portal/intake')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalIntakeController {
  constructor(private readonly intakeService: ClientPortalIntakeService) {}

  @Post()
  submit(@CurrentPortalUser() user: PortalIdentity, @Body() dto: SubmitPortalIntakeDto) {
    return this.intakeService.submit(user, dto);
  }

  @Get()
  async listMine(@CurrentPortalUser() user: PortalIdentity) {
    const submissions = await this.intakeService.listMine(user);
    return submissions.map((s) => ({
      id: s.id,
      referenceNumber: s.referenceNumber,
      title: s.title,
      submittedAt: s.submittedAt,
      withdrawnByClient: s.withdrawnByClient,
      externalStatus: s.intake ? mapInternalStatusToExternal(s.intake) : 'ส่งแล้ว',
    }));
  }
}
