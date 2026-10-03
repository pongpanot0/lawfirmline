import { AuthThrottle, MailThrottle } from '../common/throttle';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClientPortalAuthService } from './client-portal-auth.service';
import {
  PortalPasswordLoginDto,
  RequestPortalLinkDto,
  SetPortalPasswordDto,
  VerifyPortalTokenDto,
} from './dto/client-portal-auth.dto';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ClientPortalGuard } from './client-portal.guard';
import { CurrentPortalUser } from './current-portal-user.decorator';
import { PortalIdentity } from './client-portal-jwt.strategy';

@Controller('client-portal/auth')
export class ClientPortalAuthController {
  constructor(private authService: ClientPortalAuthService) {}

  @Post('request-link')
  @MailThrottle()
  @SkipSubscription()
  requestLink(@Body() dto: RequestPortalLinkDto) {
    return this.authService.requestLink(dto.email);
  }

  @Post('verify')
  @AuthThrottle()
  @SkipSubscription()
  verify(@Body() dto: VerifyPortalTokenDto) {
    return this.authService.verify(dto.token);
  }

  @Post('login')
  @AuthThrottle()
  @SkipSubscription()
  login(@Body() dto: PortalPasswordLoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password);
  }

  @Post('set-password')
  @AuthThrottle()
  @SkipSubscription()
  @UseGuards(ClientPortalGuard)
  setPassword(@CurrentPortalUser() portalUser: PortalIdentity, @Body() dto: SetPortalPasswordDto) {
    return this.authService.setPassword(portalUser, dto.password);
  }
}
