import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';
import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@RequireCapability('viewFirmReports')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.auditLog.list(user.firmId, {
      action,
      userId,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor,
    });
  }
}
