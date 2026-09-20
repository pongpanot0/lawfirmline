import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

import { SkipSubscription } from '../saas/decorators/saas.decorators';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('tasks')
  getTaskInbox(@CurrentUser() user: AuthUser) { return this.dashboardService.getTaskInbox(user); }

  @Get('stats')
  @SkipSubscription()
  getStats(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getStats(user);
  }

  @Get('workload')
  @SkipSubscription()
  getWorkload(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getWorkload(user);
  }
}
