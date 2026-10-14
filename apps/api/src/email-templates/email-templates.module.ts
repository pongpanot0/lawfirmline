import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

@Module({
  imports: [TemplatesModule],
  providers: [EmailTemplatesService, FirmRoleGuard],
  controllers: [EmailTemplatesController],
})
export class EmailTemplatesModule {}
