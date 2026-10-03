import { forwardRef, Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsSearchController } from './documents-search.controller';
import { DocumentsController } from './documents.controller';
import { DocumentRequestsController } from './document-requests.controller';
import { IntakeDocumentsController } from './intake-documents.controller';
import { DocumentPublicationService } from './document-publication.service';
import { DocumentPublicationController } from './document-publication.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [DocumentsController, IntakeDocumentsController, DocumentPublicationController, DocumentsSearchController, DocumentRequestsController],
  providers: [DocumentsService, DocumentPublicationService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
