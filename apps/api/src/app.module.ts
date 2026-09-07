import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { SaasModule } from './saas/saas.module';
import { SubscriptionGuard } from './saas/guards/subscription.guard';
import { UsersModule } from './users/users.module';
import { CasesModule } from './cases/cases.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentsModule } from './documents/documents.module';
import { CalendarModule } from './calendar/calendar.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { CaseTypesModule } from './case-types/case-types.module';
import { InsuranceClaimsModule } from './insurance-claims/insurance-claims.module';
import { ClientsModule } from './clients/clients.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { CourtsModule } from './courts/courts.module';
import { TravelModule } from './travel/travel.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { TemplatesModule } from './templates/templates.module';
import { HealthModule } from './health/health.module';
import { OperationsModule } from './operations/operations.module';
import { ClosingEmailModule } from './closing-email/closing-email.module';
import { AgendaModule } from './agenda/agenda.module';
import { DeadlinesModule } from './deadlines/deadlines.module';
import { HolidaysModule } from './holidays/holidays.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    HealthModule,
    AuthModule,
    SaasModule,
    UsersModule,
    CasesModule,
    TasksModule,
    DocumentsModule,
    CalendarModule,
    BillingModule,
    NotificationsModule,
    DashboardModule,
    ReportsModule,
    AuditLogModule,
    CaseTypesModule,
    InsuranceClaimsModule,
    ClientsModule,
    ClientPortalModule,
    CourtsModule,
    TravelModule,
    IntelligenceModule,
    TemplatesModule,
    OperationsModule,
    ClosingEmailModule,
    AgendaModule,
    DeadlinesModule,
    HolidaysModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
  ],
})
export class AppModule {}
