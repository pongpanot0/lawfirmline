import { Module, forwardRef } from '@nestjs/common';
import { SaasController, PublicInviteController, PublicFirmController } from './saas.controller';
import { TenantService } from './tenant.service';
import { SaasAuthService } from './saas-auth.service';
import { InvitationService } from './invitation.service';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';
import { TrialReminderService } from './trial-reminder.service';
import { FirmRoleGuard } from './guards/firm-role.guard';
import { TenantMatchGuard } from './guards/tenant-match.guard';
import { TenantResolveMiddleware } from './middleware/tenant-resolve.middleware';
import { AuthModule } from '../auth/auth.module';
import { CaseTypesModule } from '../case-types/case-types.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => AuthModule), CaseTypesModule, forwardRef(() => NotificationsModule), forwardRef(() => DeadlinesModule)],
  controllers: [SaasController, PublicInviteController, PublicFirmController],
  providers: [
    TenantService,
    SaasAuthService,
    InvitationService,
    SubscriptionService,
    StripeService,
    TrialReminderService,
    FirmRoleGuard,
    TenantMatchGuard,
    TenantResolveMiddleware,
  ],
  exports: [
    TenantService,
    SaasAuthService,
    FirmRoleGuard,
    TenantMatchGuard,
    TenantResolveMiddleware,
  ],
})
export class SaasModule {}
