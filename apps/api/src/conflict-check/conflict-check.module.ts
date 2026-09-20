import { Module } from '@nestjs/common';
import { ConflictCheckController } from './conflict-check.controller';
import { ConflictCheckService } from './conflict-check.service';

@Module({
  controllers: [ConflictCheckController],
  providers: [ConflictCheckService],
  exports: [ConflictCheckService],
})
export class ConflictCheckModule {}
