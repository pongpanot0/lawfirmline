import { Module } from '@nestjs/common';
import { AiTrayController } from './ai-tray.controller';
import { AiTrayService } from './ai-tray.service';

@Module({ controllers: [AiTrayController], providers: [AiTrayService] })
export class AiTrayModule {}
