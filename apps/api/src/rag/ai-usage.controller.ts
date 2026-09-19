import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiUsageService } from './ai-usage.service';

@Controller('ai-usage')
@UseGuards(JwtAuthGuard)
export class AiUsageController {
  constructor(private aiUsage: AiUsageService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const parsed = Number(days);
    const window = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 365) : 30;
    return this.aiUsage.summary(user.firmId, window);
  }
}
