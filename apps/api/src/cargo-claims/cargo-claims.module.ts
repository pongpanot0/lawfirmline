import { Module } from '@nestjs/common';
import { CargoClaimsController } from './cargo-claims.controller';
import { CargoClaimsService } from './cargo-claims.service';

@Module({
  controllers: [CargoClaimsController],
  providers: [CargoClaimsService],
  exports: [CargoClaimsService],
})
export class CargoClaimsModule {}
