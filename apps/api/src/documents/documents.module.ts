import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentPublicationService } from './document-publication.service';
import { DocumentPublicationController } from './document-publication.controller';

@Module({
  controllers: [DocumentsController, DocumentPublicationController],
  providers: [DocumentsService, DocumentPublicationService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
