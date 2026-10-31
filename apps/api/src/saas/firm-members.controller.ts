import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from './guards/firm-role.guard';
import { RequireCapability, SkipSubscription } from './decorators/saas.decorators';
import { TenantService } from './tenant.service';
import { UpdateWorkSettingsDto } from './dto/saas.dto';

@Controller('firm-members')
export class FirmMembersController {
  constructor(private tenant: TenantService) {}

  @Patch(':userId/work-settings')
  @UseGuards(JwtAuthGuard, FirmRoleGuard)
  @RequireCapability('runOperations')
  @SkipSubscription()
  updateWorkSettings(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateWorkSettingsDto,
  ) {
    return this.tenant.updateMemberWorkSettings(user, userId, dto);
  }
}
