import { SetMetadata } from '@nestjs/common';
import { FirmCapability, FirmRole } from '@lawfirm/shared';

export const FIRM_ROLES_KEY = 'firmRoles';
export const FirmRoles = (...roles: FirmRole[]) => SetMetadata(FIRM_ROLES_KEY, roles);

export const SKIP_SUBSCRIPTION_KEY = 'skipSubscription';
export const SkipSubscription = () => SetMetadata(SKIP_SUBSCRIPTION_KEY, true);

export const OWNER_ONLY_KEY = 'ownerOnly';
export const OwnerOnly = () => SetMetadata(OWNER_ONLY_KEY, true);

export const REQUIRE_CAPABILITY_KEY = 'requireCapability';
/** Route needs this firm capability (see packages/shared firm-capabilities). Pair with FirmRoleGuard. */
export const RequireCapability = (cap: FirmCapability) => SetMetadata(REQUIRE_CAPABILITY_KEY, cap);
