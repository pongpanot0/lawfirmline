import { Module } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { EmailIntakeController } from './email-intake.controller';

@Module({
  controllers: [EmailIntakeController],
  providers: [EmailIntakeService],
  exports: [EmailIntakeService],
})
export class EmailIntakeModule {}
