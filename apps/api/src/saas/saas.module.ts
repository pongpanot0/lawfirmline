import { Module, forwardRef } from '@nestjs/common';
import { SaasController, PublicInviteController } from './saas.controller';
import { TenantService } from './tenant.service';
import { SaasAuthService } from './saas-auth.service';
import { InvitationService } from './invitation.service';
import { SubscriptionService } from './subscription.service';
import { OmiseService } from './omise.service';
import { FirmRoleGuard } from './guards/firm-role.guard';
import { SubscriptionGuard } from './guards/subscription.guard';
import { TenantMatchGuard } from './guards/tenant-match.guard';
import { TenantResolveMiddleware } from './middleware/tenant-resolve.middleware';
import { AuthModule } from '../auth/auth.module';
import { CaseTypesModule } from '../case-types/case-types.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => AuthModule), CaseTypesModule, NotificationsModule, DeadlinesModule],
  controllers: [SaasController, PublicInviteController],
  providers: [
    TenantService,
    SaasAuthService,
    InvitationService,
    SubscriptionService,
    OmiseService,
    FirmRoleGuard,
    SubscriptionGuard,
    TenantMatchGuard,
    TenantResolveMiddleware,
  ],
  exports: [
    TenantService,
    SaasAuthService,
    SubscriptionGuard,
    FirmRoleGuard,
    TenantMatchGuard,
    TenantResolveMiddleware,
  ],
})
export class SaasModule {}
