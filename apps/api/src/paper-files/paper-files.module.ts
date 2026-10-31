import { Module } from '@nestjs/common';
import { PaperFilesController } from './paper-files.controller';
import { PaperFilesService } from './paper-files.service';

@Module({
  controllers: [PaperFilesController],
  providers: [PaperFilesService],
})
export class PaperFilesModule {}
