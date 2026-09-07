import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser, Role } from '@lawfirm/shared';
import { DeadlineRulesService } from './deadline-rules.service';
import { CreateDeadlineRuleDto, UpdateDeadlineRuleDto } from './dto/deadline-rule.dto';
import { ApplyDeadlineTriggerDto } from './dto/apply-trigger.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('deadline-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeadlineRulesController {
  constructor(private rules: DeadlineRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.rules.list(user);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDeadlineRuleDto) {
    return this.rules.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDeadlineRuleDto,
  ) {
    return this.rules.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rules.remove(user, id);
  }
}

@Controller('cases/:caseId/deadlines')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class CaseDeadlinesController {
  constructor(private rules: DeadlineRulesService) {}

  /**
   * Fires the procedural clocks that no calendar event represents — a judgment
   * read out, an order received, a complaint served.
   */
  @Post('apply')
  apply(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: ApplyDeadlineTriggerDto,
  ) {
    return this.rules.applyTriggerForCase(user, caseId, dto);
  }
}
