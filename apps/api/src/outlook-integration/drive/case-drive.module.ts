import { Module } from '@nestjs/common';
import { OutlookIntegrationModule } from '../outlook-integration.module';
import { DocumentsModule } from '../../documents/documents.module';
import { CaseDriveService } from './case-drive.service';
import { DocumentOfficeService } from './document-office.service';
import { CaseDriveController } from './case-drive.controller';
import { DrivePickerController } from './drive-picker.controller';

/** ส่วน D — separate module so OutlookIntegrationModule never has to import DocumentsModule (no cycle). */
@Module({
  imports: [OutlookIntegrationModule, DocumentsModule],
  controllers: [CaseDriveController, DrivePickerController],
  providers: [CaseDriveService, DocumentOfficeService],
})
export class CaseDriveModule {}
