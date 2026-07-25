import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthUser) {
    return this.reportsService.getSummary(user);
  }
}
