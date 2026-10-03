import { Throttle } from '@nestjs/throttler';

/**
 * Brute-force ceilings per client IP for endpoints that take a secret
 * (password, OTP, magic link, reset/invite token). Generous enough for a
 * person retyping, far too slow for guessing.
 */
export const AuthThrottle = () => Throttle({ default: { ttl: 60_000, limit: 10 } });
/** Endpoints that send an email or SMS-like message: also slow down mail-bombing a victim. */
export const MailThrottle = () => Throttle({ default: { ttl: 10 * 60_000, limit: 5 } });
