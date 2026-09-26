import { forwardRef, Module } from '@nestjs/common';
import { LineController } from './line.controller';
import { DevicesController } from './devices.controller';
import { PushService } from './push.service';
import { ReminderScheduler } from './reminder.scheduler';
import { DailyDigestScheduler } from './daily-digest.scheduler';
import { EscalationScheduler } from './escalation.scheduler';
import { LineMessagingService } from './line-messaging.service';
import { AssignmentNotifierService } from './assignment-notifier.service';
import { FirmLinkService } from './firm-link.service';
import { LineLinkService } from './line-link.service';
import { LinkCodeAttemptLimiterService } from './link-code-attempt-limiter.service';
import { EmailService } from './email.service';
import { ContactLineLinkService } from './contact-line-link.service';
import { ContactNotificationPreferenceService } from './contact-notification-preference.service';
import { LineConversationStoreService } from './line-conversation/line-conversation-store.service';
import { LineAuthContextService } from './line-conversation/line-auth-context.service';
import { LineBotRouterService } from './line-conversation/line-bot-router.service';
import { LineNotificationService } from './line-conversation/line-notification.service';
import { LineCaseFlowService } from './line-conversation/flows/line-case-flow.service';
import { LineTaskFlowService } from './line-conversation/flows/line-task-flow.service';
import { LineTodoFlowService } from './line-conversation/flows/line-todo-flow.service';
import { LineExpenseFlowService } from './line-conversation/flows/line-expense-flow.service';
import { LineAdvanceFlowService } from './line-conversation/flows/line-advance-flow.service';
import { LineLeaveFlowService } from './line-conversation/flows/line-leave-flow.service';
import { LeaveService } from '../leave/leave.service';
import { LeaveController } from '../leave/leave.controller';
import { BillingModule } from '../billing/billing.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { TasksModule } from '../tasks/tasks.module';
import { ClientsModule } from '../clients/clients.module';
import { CasesModule } from '../cases/cases.module';
import { UsersModule } from '../users/users.module';
import { SaasModule } from '../saas/saas.module';
import { AgendaModule } from '../agenda/agenda.module';

@Module({
  imports: [
    forwardRef(() => TasksModule),
    forwardRef(() => ClientsModule),
    forwardRef(() => CasesModule),
    UsersModule,
    forwardRef(() => SaasModule),
    AgendaModule,
    forwardRef(() => BillingModule),
    forwardRef(() => IntelligenceModule),
  ],
  controllers: [LineController, DevicesController, LeaveController],
  providers: [
    PushService,
    ReminderScheduler,
    DailyDigestScheduler,
    EscalationScheduler,
    LineMessagingService,
    AssignmentNotifierService,
    FirmLinkService,
    LineLinkService,
    LinkCodeAttemptLimiterService,
    EmailService,
    ContactLineLinkService,
    ContactNotificationPreferenceService,
    LineConversationStoreService,
    LineAuthContextService,
    LineBotRouterService,
    LineNotificationService,
    LineCaseFlowService,
    LineTaskFlowService,
    LineTodoFlowService,
    LineExpenseFlowService,
    LineAdvanceFlowService,
    LineLeaveFlowService,
    LeaveService,
  ],
  exports: [
    PushService,
    LineMessagingService,
    AssignmentNotifierService,
    FirmLinkService,
    LineLinkService,
    EmailService,
    ContactLineLinkService,
    ContactNotificationPreferenceService,
  ],
})
export class NotificationsModule {}
