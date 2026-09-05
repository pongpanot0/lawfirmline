import { Body, Controller, Delete, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ContactLineLinkService } from '../notifications/contact-line-link.service';
import { ContactNotificationPreferenceService } from '../notifications/contact-notification-preference.service';
import { UpdateNotificationPreferenceDto } from '../notifications/dto/update-notification-preference.dto';

@Controller('client-portal/integrations')
@UseGuards(ClientPortalGuard)
@SkipSubscription()
export class ClientPortalIntegrationsController {
  constructor(
    private lineLink: ContactLineLinkService,
    private preferences: ContactNotificationPreferenceService,
  ) {}

  @Get('line/me')
  getLineStatus(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.lineLink.getPersonalStatus(portalUser.clientContactId);
  }

  @Post('line/me/link-code')
  createLinkCode(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.lineLink.createLinkCode(portalUser.clientContactId);
  }

  @Delete('line/me')
  disconnectLine(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.lineLink.disconnect(portalUser.clientContactId);
  }

  @Get('notifications')
  getPreferences(@CurrentPortalUser() portalUser: PortalIdentity) {
    return this.preferences.getForContact(portalUser.clientContactId);
  }

  @Patch('notifications')
  updatePreference(
    @CurrentPortalUser() portalUser: PortalIdentity,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.preferences.setForContact(portalUser.clientContactId, dto.channel, dto.isEnabled);
  }
}
