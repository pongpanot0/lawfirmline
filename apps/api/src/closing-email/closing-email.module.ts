import { Module } from '@nestjs/common';
import { ClosingEmailController } from './closing-email.controller';
import { ClosingEmailService } from './closing-email.service';

@Module({
  controllers: [ClosingEmailController],
  providers: [ClosingEmailService],
})
export class ClosingEmailModule {}
