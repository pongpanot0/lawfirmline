import { forwardRef, Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { ReminderScheduler } from './reminder.scheduler';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';
import { EmailService } from './email.service';
import { ContactLineLinkService } from './contact-line-link.service';
import { ContactNotificationPreferenceService } from './contact-notification-preference.service';
import { LineConversationStoreService } from './line-conversation/line-conversation-store.service';
import { LineAuthContextService } from './line-conversation/line-auth-context.service';
import { LineBotRouterService } from './line-conversation/line-bot-router.service';
import { LineNotificationService } from './line-conversation/line-notification.service';
import { LineIntakeFlowService } from './line-conversation/flows/line-intake-flow.service';
import { LineTaskFlowService } from './line-conversation/flows/line-task-flow.service';
import { LineTodoFlowService } from './line-conversation/flows/line-todo-flow.service';
import { IntakeModule } from '../intake/intake.module';
import { TasksModule } from '../tasks/tasks.module';
import { ClientsModule } from '../clients/clients.module';
import { CasesModule } from '../cases/cases.module';
import { UsersModule } from '../users/users.module';
import { SaasModule } from '../saas/saas.module';

@Module({
  imports: [
    IntakeModule,
    TasksModule,
    ClientsModule,
    forwardRef(() => CasesModule),
    UsersModule,
    forwardRef(() => SaasModule),
  ],
  controllers: [LineController],
  providers: [
    ReminderScheduler,
    LineMessagingService,
    LineLinkService,
    EmailService,
    ContactLineLinkService,
    ContactNotificationPreferenceService,
    LineConversationStoreService,
    LineAuthContextService,
    LineBotRouterService,
    LineNotificationService,
    LineIntakeFlowService,
    LineTaskFlowService,
    LineTodoFlowService,
  ],
  exports: [
    LineMessagingService,
    LineLinkService,
    EmailService,
    ContactLineLinkService,
    ContactNotificationPreferenceService,
  ],
})
export class NotificationsModule {}
