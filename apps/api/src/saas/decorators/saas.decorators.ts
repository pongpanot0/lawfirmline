import { SetMetadata } from '@nestjs/common';
import { FirmCapability, FirmRole, PlanFeature } from '@lawfirm/shared';

export const FIRM_ROLES_KEY = 'firmRoles';
export const FirmRoles = (...roles: FirmRole[]) => SetMetadata(FIRM_ROLES_KEY, roles);

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscription';
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION_KEY, true);

export const OWNER_ONLY_KEY = 'ownerOnly';
export const OwnerOnly = () => SetMetadata(OWNER_ONLY_KEY, true);

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';
/** Route needs this firm capability (see packages/shared firm-capabilities). Pair with FirmRoleGuard. */
export const RequireCapability = (cap: FirmCapability) => SetMetadata(REQUIRE_CAPABILITY_KEY, cap);

export const REQUIRE_PLAN_FEATURE_KEY = 'requirePlanFeature';
/**
 * Route needs a plan feature (checked in JwtAuthGuard). `writesOnly`: reads stay open so a
 * firm that moves down a plan still sees what it already made.
 */
export const RequirePlanFeature = (feature: PlanFeature, opts: { writesOnly?: boolean } = {}) =>
  SetMetadata(REQUIRE_PLAN_FEATURE_KEY, { feature, writesOnly: !!opts.writesOnly });
