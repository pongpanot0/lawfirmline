import { SetMetadata } from '@nestjs/common';

export const REQUIRE_CREDITS_KEY = 'require_credits';

export const RequireCredits = (amount: number) =>
  SetMetadata(REQUIRE_CREDITS_KEY, amount);
