import { DocumentTemplatesModule } from '../document-templates/document-templates.module';
import { forwardRef, Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { Client360Service } from './client-360.service';

@Module({
  imports: [DocumentTemplatesModule, forwardRef(() => NotificationsModule)],
  controllers: [ClientsController],
  providers: [ClientsService, Client360Service],
  exports: [ClientsService],
})
export class ClientsModule {}
