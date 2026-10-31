import { Module, forwardRef } from '@nestjs/common';
import { FirmMembersController } from './firm-members.controller';
import { SaasController, PublicInviteController, PublicFirmController } from './saas.controller';
import { TenantService } from './tenant.service';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { SaasAuthService } from './saas-auth.service';
import { InvitationService } from './invitation.service';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';
import { TrialReminderService } from './trial-reminder.service';
import { FirmRoleGuard } from './guards/firm-role.guard';
import { TenantResolveMiddleware } from './middleware/tenant-resolve.middleware';
import { AuthModule } from '../auth/auth.module';
import { CaseTypesModule } from '../case-types/case-types.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => AuthModule), CaseTypesModule, forwardRef(() => NotificationsModule), forwardRef(() => DeadlinesModule)],
  controllers: [SaasController, FirmMembersController, PublicInviteController, PublicFirmController, PlatformAdminController],
  providers: [
    TenantService,
    PlatformAdminService,
    SaasAuthService,
    InvitationService,
    SubscriptionService,
    StripeService,
    TrialReminderService,
    FirmRoleGuard,
    TenantResolveMiddleware,
  ],
  exports: [
    TenantService,
    SaasAuthService,
    FirmRoleGuard,
    TenantResolveMiddleware,
  ],
})
export class SaasModule {}
