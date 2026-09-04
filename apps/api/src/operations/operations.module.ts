import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  controllers: [OperationsController],
  providers: [OperationsService, FirmRoleGuard],
})
export class OperationsModule {}
