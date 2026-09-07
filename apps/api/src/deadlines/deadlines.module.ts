import { Module } from '@nestjs/common';
import { DeadlineRulesService } from './deadline-rules.service';
import { CaseDeadlinesController, DeadlineRulesController } from './deadlines.controller';

@Module({
  controllers: [DeadlineRulesController, CaseDeadlinesController],
  providers: [DeadlineRulesService],
  exports: [DeadlineRulesService],
})
export class DeadlinesModule {}
