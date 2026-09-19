import { Module } from '@nestjs/common';
import { SopsController } from './sops.controller';
import { SopsService } from './sops.service';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  controllers: [SopsController],
  providers: [SopsService, FirmRoleGuard],
})
export class SopsModule {}
