import { ActionCenterService } from './action-center.service';
import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { TravelModule } from '../travel/travel.module';

@Module({
  imports: [TravelModule],
  controllers: [AgendaController],
  providers: [AgendaService, ActionCenterService],
  exports: [AgendaService],
})
export class AgendaModule {}
