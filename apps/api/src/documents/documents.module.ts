import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentPublicationService } from './document-publication.service';
import { DocumentPublicationController } from './document-publication.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DocumentsController, DocumentPublicationController],
  providers: [DocumentsService, DocumentPublicationService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
