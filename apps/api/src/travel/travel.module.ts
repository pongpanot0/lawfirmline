import { Module } from '@nestjs/common';
import { TravelService } from './travel.service';
import { TravelController } from './travel.controller';

@Module({
  providers: [TravelService],
  controllers: [TravelController],
  exports: [TravelService],
})
export class TravelModule {}
