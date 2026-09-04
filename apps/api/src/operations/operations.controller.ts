import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
}
