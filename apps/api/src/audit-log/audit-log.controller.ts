import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser, Role } from '@lawfirm/shared';
import { AuditLogService } from './audit-log.service';

@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
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
