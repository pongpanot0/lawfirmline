import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CasesModule } from './cases/cases.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentsModule } from './documents/documents.module';
import { CalendarModule } from './calendar/calendar.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CaseTypesModule } from './case-types/case-types.module';
import { TravelModule } from './travel/travel.module';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    CasesModule,
    TasksModule,
    DocumentsModule,
    CalendarModule,
    BillingModule,
    NotificationsModule,
    DashboardModule,
    CaseTypesModule,
    TravelModule,
    IntelligenceModule,
    TemplatesModule,
  ],
})
export class AppModule {}
