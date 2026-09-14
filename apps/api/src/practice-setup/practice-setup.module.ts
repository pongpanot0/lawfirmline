import { Module } from '@nestjs/common';
import { PracticeSetupController } from './practice-setup.controller';
import { PracticeSetupService } from './practice-setup.service';
@Module({ controllers: [PracticeSetupController], providers: [PracticeSetupService] })
export class PracticeSetupModule {}
