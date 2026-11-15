import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FeePackagesController } from './fee-packages.controller';
import { FeePackagesService } from './fee-packages.service';

@Module({ imports: [forwardRef(() => NotificationsModule)], controllers: [FeePackagesController], providers: [FeePackagesService], exports: [FeePackagesService] })
export class FeePackagesModule {}
