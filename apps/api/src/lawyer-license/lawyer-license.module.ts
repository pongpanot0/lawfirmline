import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LawyerLicenseController } from './lawyer-license.controller';
import { LawyerLicenseService } from './lawyer-license.service';

@Module({
  imports: [NotificationsModule],
  controllers: [LawyerLicenseController],
  providers: [LawyerLicenseService],
})
export class LawyerLicenseModule {}
