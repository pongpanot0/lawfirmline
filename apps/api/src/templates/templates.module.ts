import { Module } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  providers: [TemplatesService, FirmRoleGuard],
  controllers: [TemplatesController],
  exports: [TemplatesService],
})
export class TemplatesModule {}
