import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { PlatformTemplatesController, TemplatesController } from './templates.controller';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  providers: [TemplatesService, FirmRoleGuard],
  controllers: [TemplatesController, PlatformTemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
