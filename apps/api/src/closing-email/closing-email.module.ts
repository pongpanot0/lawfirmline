import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClosingEmailController } from './closing-email.controller';
import { ClosingEmailService } from './closing-email.service';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [ClosingEmailController],
  providers: [ClosingEmailService],
})
export class ClosingEmailModule {}
