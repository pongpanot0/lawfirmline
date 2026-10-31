import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { METRICS_PERIODS, MetricsPeriod } from '../operations/firm-metrics';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthUser) {
    return this.reportsService.getSummary(user);
  }

  @Get('firm-metrics')
  @UseGuards(FirmRoleGuard)
  @RequireCapability('viewFirmReports')
  getFirmMetrics(@CurrentUser() user: AuthUser, @Query('period') period: string = 'this_month') {
    if (!METRICS_PERIODS.includes(period as MetricsPeriod)) throw new BadRequestException('Invalid period');
    return this.reportsService.getFirmMetrics(user, period as MetricsPeriod);
  }
}
