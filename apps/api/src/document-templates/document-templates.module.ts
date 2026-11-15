import { Module } from '@nestjs/common';
import { DocumentTemplatesController } from './document-templates.controller';
import { DocumentTemplatesService } from './document-templates.service';

@Module({ controllers: [DocumentTemplatesController], providers: [DocumentTemplatesService], exports: [DocumentTemplatesService] })
export class DocumentTemplatesModule {}
