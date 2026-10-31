import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from './decorators/saas.decorators';
import { PlatformAdminService } from './platform-admin.service';
import { UpdatePlatformFirmDto } from './dto/platform-admin.dto';

@Controller('platform')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@SkipSubscription()
export class PlatformAdminController {
  constructor(private platform: PlatformAdminService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('firms')
  listFirms(@Query('q') q?: string) {
    return this.platform.listFirms(q);
  }

  @Get('firms/:id')
  firmDetail(@Param('id') id: string) {
    return this.platform.firmDetail(id);
  }

  @Get('firms/:id/members')
  listMembers(@Param('id') id: string) {
    return this.platform.listMembers(id);
  }

  @Patch('firms/:id')
  updateFirm(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePlatformFirmDto) {
    return this.platform.updateFirm(user, id, dto);
  }
}
