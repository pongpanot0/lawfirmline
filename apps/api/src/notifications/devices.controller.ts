import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { PushService } from './push.service';
import { RegisterDeviceDto } from './dto/device.dto';

@Controller('notifications/devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private push: PushService) {}

  @Post()
  @SkipSubscription()
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.push.register(user.id, dto.token, dto.platform);
  }

  @Delete(':token')
  @SkipSubscription()
  unregister(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.push.unregister(user.id, token);
  }
}
