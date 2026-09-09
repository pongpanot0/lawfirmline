import { Module } from '@nestjs/common';
import { DocumentReviewService } from './document-review.service';
import { DocumentReviewController } from './document-review.controller';

@Module({
  controllers: [DocumentReviewController],
  providers: [DocumentReviewService],
  exports: [DocumentReviewService],
})
export class DocumentReviewModule {}
