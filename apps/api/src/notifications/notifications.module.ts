import { forwardRef, Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { DevicesController } from './devices.controller';
import { PushService } from './push.service';
import { ReminderScheduler } from './reminder.scheduler';
import { DailyDigestScheduler } from './daily-digest.scheduler';
import { LineMessagingService } from './line-messaging.service';
import { AssignmentNotifierService } from './assignment-notifier.service';
import { LineLinkService } from './line-link.service';
import { LinkCodeAttemptLimiterService } from './link-code-attempt-limiter.service';
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
import { LineExpenseFlowService } from './line-conversation/flows/line-expense-flow.service';
import { LineAdvanceFlowService } from './line-conversation/flows/line-advance-flow.service';
import { BillingModule } from '../billing/billing.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { IntakeModule } from '../intake/intake.module';
import { TasksModule } from '../tasks/tasks.module';
import { ClientsModule } from '../clients/clients.module';
import { CasesModule } from '../cases/cases.module';
import { UsersModule } from '../users/users.module';
import { SaasModule } from '../saas/saas.module';
import { AgendaModule } from '../agenda/agenda.module';

@Module({
  imports: [
    forwardRef(() => IntakeModule),
    forwardRef(() => TasksModule),
    forwardRef(() => ClientsModule),
    forwardRef(() => CasesModule),
    UsersModule,
    forwardRef(() => SaasModule),
    AgendaModule,
    forwardRef(() => BillingModule),
    IntelligenceModule,
  ],
  controllers: [LineController, DevicesController],
  providers: [
    PushService,
    ReminderScheduler,
    DailyDigestScheduler,
    LineMessagingService,
    AssignmentNotifierService,
    LineLinkService,
    LinkCodeAttemptLimiterService,
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
    LineExpenseFlowService,
    LineAdvanceFlowService,
  ],
  exports: [
    PushService,
    LineMessagingService,
    AssignmentNotifierService,
    LineLinkService,
    EmailService,
    ContactLineLinkService,
    ContactNotificationPreferenceService,
  ],
})
export class NotificationsModule {}
