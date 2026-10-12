import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentReviewService } from './document-review.service';
import { DocumentReviewController } from './document-review.controller';
import { DocumentReviewScheduler } from './document-review.scheduler';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [DocumentReviewController],
  providers: [DocumentReviewService, DocumentReviewScheduler],
  exports: [DocumentReviewService],
})
export class DocumentReviewModule {}
