import { forwardRef, Module } from '@nestjs/common';
import { CargoClaimsController } from './cargo-claims.controller';
import { CargoClaimsService } from './cargo-claims.service';
import { PracticeSetupModule } from '../practice-setup/practice-setup.module';

@Module({
  imports: [forwardRef(() => PracticeSetupModule)],
  controllers: [CargoClaimsController],
  providers: [CargoClaimsService],
  exports: [CargoClaimsService],
})
export class CargoClaimsModule {}
