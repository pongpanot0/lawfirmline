import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { LawyerLicenseService } from './lawyer-license.service';
import { UpdateLicenseDto } from './dto/lawyer-license.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class LawyerLicenseController {
  constructor(private licenses: LawyerLicenseService) {}

  @Get('users/me/license')
  getMine(@CurrentUser() user: AuthUser) {
    return this.licenses.getMine(user.id);
  }

  @Patch('users/me/license')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateLicenseDto) {
    return this.licenses.updateMine(user, dto);
  }

  @Patch('firm-members/:userId/license')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('runOperations')
  updateMember(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() dto: UpdateLicenseDto) {
    return this.licenses.updateMember(user, userId, dto);
  }
}
