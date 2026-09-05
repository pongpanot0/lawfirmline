import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { IntakeService } from './intake.service';
import { IntakeController } from './intake.controller';

@Module({
  imports: [TasksModule],
  controllers: [IntakeController],
  providers: [IntakeService, AiCreditsInterceptor],
  exports: [IntakeService],
})
export class IntakeModule {}
