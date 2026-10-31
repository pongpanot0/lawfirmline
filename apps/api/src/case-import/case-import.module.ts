import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { CaseImportController } from './case-import.controller';
import { CaseImportService } from './case-import.service';

@Module({
  imports: [CasesModule],
  controllers: [CaseImportController],
  providers: [CaseImportService],
})
export class CaseImportModule {}
