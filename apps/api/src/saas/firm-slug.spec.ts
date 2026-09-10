import {
  DEFAULT_ROOT_DOMAIN,
  extractFirmSlugFromHost,
  isReservedFirmSlug,
} from '@lawfirm/shared';

describe('firm slug helpers', () => {
  it('extracts tenant slug from samnaun.com subdomain', () => {
    expect(extractFirmSlugFromHost('thesiambarrister.samnaun.com', DEFAULT_ROOT_DOMAIN)).toBe(
      'thesiambarrister',
    );
  });

  it('returns null for apex and www', () => {
    expect(extractFirmSlugFromHost('samnaun.com')).toBeNull();
    expect(extractFirmSlugFromHost('www.samnaun.com')).toBeNull();
    expect(extractFirmSlugFromHost('api.samnaun.com')).toBeNull();
  });

  it('supports localhost subdomain for development', () => {
    expect(extractFirmSlugFromHost('thesiambarrister.localhost:3005')).toBe('thesiambarrister');
  });

  it('rejects reserved slugs', () => {
    expect(isReservedFirmSlug('www')).toBe(true);
    expect(isReservedFirmSlug('api')).toBe(true);
    expect(extractFirmSlugFromHost('www.samnaun.com')).toBeNull();
    expect(extractFirmSlugFromHost('api.samnaun.com')).toBeNull();
  });
});
