import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { ErrorLogService } from './error-log.service';
import { ClientErrorDto, ErrorLogQueryDto, ResolveErrorsDto } from './dto/error-log.dto';

@Controller('platform/error-logs')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@SkipSubscription()
export class ErrorLogController {
  constructor(private errors: ErrorLogService) {}

  @Get()
  list(@Query() query: ErrorLogQueryDto) {
    return this.errors.list(query);
  }

  @Get('summary')
  summary() {
    return this.errors.summary();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.errors.get(id);
  }

  @Patch('resolve')
  resolve(@CurrentUser() user: AuthUser, @Body() dto: ResolveErrorsDto) {
    return this.errors.setResolved(dto.ids, dto.resolved, user.email);
  }
}

/**
 * Browser errors. Public on purpose — a crash can happen before sign-in — so the
 * body is clipped, the rate is low, and nothing here is trusted beyond a log line.
 */
@Controller('client-errors')
export class ClientErrorController {
  constructor(private errors: ErrorLogService) {}

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  report(@Body() dto: ClientErrorDto, @Headers('user-agent') userAgent?: string) {
    this.errors.record({ source: 'web', message: dto.message, stack: dto.stack, path: dto.url, context: dto.kind, userAgent });
    return { ok: true };
  }
}
