import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutlookAdminStatusService } from './outlook-admin-status.service';

@Controller('outlook/admin')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@RequireCapability('runOperations')
export class OutlookAdminController {
  constructor(private status: OutlookAdminStatusService) {}

  @Get('status')
  getStatus(@CurrentUser() user: AuthUser) {
    return this.status.getStatus(user);
  }

  @Post('connections/:id/remind')
  remind(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.status.remind(user, id);
  }
}
