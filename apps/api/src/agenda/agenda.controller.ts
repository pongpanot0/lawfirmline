import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { AgendaService } from './agenda.service';
import { AgendaRangeDto } from './dto/agenda.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../saas/decorators/saas.decorators';

@Controller('agenda')
@UseGuards(JwtAuthGuard)
export class AgendaController {
  constructor(private agendaService: AgendaService) {}

  /** Everything the caller owes, bucketed for the "my day" screen. */
  @Get('my-day')
  @SkipSubscription()
  getMyDay(@CurrentUser() user: AuthUser) {
    return this.agendaService.getMyDay(user);
  }

  /** Flat, explicitly ranged agenda — used by the calendar and digest previews. */
  @Get()
  getRange(@CurrentUser() user: AuthUser, @Query() query: AgendaRangeDto) {
    return this.agendaService.getAgenda(user, new Date(query.from), new Date(query.to));
  }
}
