/**
 * The token strategies fall back to fixed dev secrets that are in the repo;
 * in production a missing secret would let anyone forge a login. Refuse to
 * start instead.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const missing = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_PORTAL_JWT_SECRET'].filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Refusing to start: ${missing.join(', ')} must be set in production`);
}
