import { assertProductionSecrets } from './production-secrets';

describe('assertProductionSecrets', () => {
  const all = { JWT_SECRET: 'a', JWT_REFRESH_SECRET: 'b', CLIENT_PORTAL_JWT_SECRET: 'c' };
  it('refuses to start production without a token secret', () => {
    expect(() => assertProductionSecrets({ ...all, NODE_ENV: 'production', CLIENT_PORTAL_JWT_SECRET: ' ' }))
      .toThrow('CLIENT_PORTAL_JWT_SECRET');
  });
  it('starts when every secret is set, and never blocks development', () => {
    expect(() => assertProductionSecrets({ ...all, NODE_ENV: 'production' })).not.toThrow();
    expect(() => assertProductionSecrets({ NODE_ENV: 'development' })).not.toThrow();
  });
});
