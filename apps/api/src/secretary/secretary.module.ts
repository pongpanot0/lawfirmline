import { forwardRef, Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';
import { AgendaModule } from '../agenda/agenda.module';
import { DailyBriefService } from './daily-brief.service';
import { DailyBriefScheduler } from './daily-brief.scheduler';
import { SecretaryToolsService } from './secretary-tools.service';
import { MatterBriefService } from './matter-brief.service';
import { SecretaryChatService } from './secretary-chat.service';
import { SecretaryController } from './secretary.controller';
import { AiWriteToolsService } from './ai-write-tools.service';
import { TasksModule } from '../tasks/tasks.module';
import { CasesModule } from '../cases/cases.module';
import { OperationsModule } from '../operations/operations.module';

// PrismaModule and CommonModule (CaseAccessService/Guard) are @Global.
@Module({
  imports: [forwardRef(() => RagModule), forwardRef(() => NotificationsModule), forwardRef(() => BillingModule), forwardRef(() => TasksModule), forwardRef(() => CasesModule), forwardRef(() => OperationsModule), AgendaModule],
  controllers: [SecretaryController],
  providers: [MatterBriefService, SecretaryToolsService, SecretaryChatService, DailyBriefService, DailyBriefScheduler, AiWriteToolsService],
  exports: [MatterBriefService, SecretaryToolsService, SecretaryChatService, AiWriteToolsService],
})
export class SecretaryModule {}
