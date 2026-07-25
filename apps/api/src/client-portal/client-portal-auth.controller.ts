import { Body, Controller, Post } from '@nestjs/common';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { RequestPortalLinkDto, VerifyPortalTokenDto } from './dto/client-portal-auth.dto';
import { SkipSubscription } from '../saas/decorators/saas.decorators';

@Controller('client-portal/auth')
export class ClientPortalAuthController {
  constructor(private authService: ClientPortalAuthService) {}

  @Post('request-link')
  @SkipSubscription()
  requestLink(@Body() dto: RequestPortalLinkDto) {
    return this.authService.requestLink(dto.email);
  }

  @Post('verify')
  @SkipSubscription()
  verify(@Body() dto: VerifyPortalTokenDto) {
    return this.authService.verify(dto.token);
  }
}
