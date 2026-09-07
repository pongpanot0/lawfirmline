import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClientPortalInviteService } from './client-portal-invite.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { CreatePortalInviteDto } from './dto/client-portal-invite.dto';

@Controller('client-portal/invites')
export class ClientPortalInviteController {
  constructor(private readonly invites: ClientPortalInviteService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePortalInviteDto) {
    return this.invites.createInvite(user, dto.clientContactId);
  }

  @Get(':token')
  @SkipSubscription()
  get(@Param('token') token: string) {
    return this.invites.getInvite(token);
  }

  @Post(':token/accept')
  @SkipSubscription()
  accept(@Param('token') token: string) {
    return this.invites.acceptInvite(token);
  }
}
