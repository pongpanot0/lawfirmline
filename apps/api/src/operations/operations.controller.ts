import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { OwnerOnly } from '../saas/decorators/saas.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { OperationsService } from './operations.service';
import { WorkloadQueryDto } from './dto/operations.dto';

@Controller('operations')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@OwnerOnly()
export class OperationsController {
  constructor(private operationsService: OperationsService) {}

  @Get('workload')
  getWorkload(@CurrentUser() user: AuthUser, @Query() query: WorkloadQueryDto) {
    return this.operationsService.getWorkloadSummary(user, query);
  }

  @Get('workload/:userId')
  getWorkloadDetail(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Query() query: WorkloadQueryDto,
  ) {
    return this.operationsService.getWorkloadDetail(user, userId, query);
  }

  @Get('pairing')
  getPairing(@CurrentUser() user: AuthUser) {
    return this.operationsService.getPairing(user);
  }

  @Get('case-health')
  getCaseHealth(@CurrentUser() user: AuthUser) {
    return this.operationsService.getCaseHealth(user);
  }

  @Get('sla')
  getSla(@CurrentUser() user: AuthUser) {
    return this.operationsService.getSlaConfig(user);
  }

  @Patch('sla')
  updateSla(@CurrentUser() user: AuthUser, @Body() dto: Record<string, number>) {
    return this.operationsService.updateSlaConfig(user, dto);
  }

  @Get('performance')
  getPerformance(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.operationsService.getTeamPerformance(user, days ? Math.max(7, parseInt(days, 10) || 30) : 30);
  }

  @Get('workflow-metrics')
  getWorkflowMetrics(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.operationsService.getWorkflowMetrics(user, days ? Math.min(365, Math.max(7, parseInt(days, 10) || 30)) : 30);
  }

  @Get('onhold')
  getOnHoldTasks(@CurrentUser() user: AuthUser) {
    return this.operationsService.getOnHoldTasks(user);
  }

  @Get('owner-kpis')
  getOwnerKpis(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.operationsService.getOwnerKpis(user, month);
  }
}
