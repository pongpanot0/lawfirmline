import {
  DEFAULT_ROOT_DOMAIN,
  buildFirmAppOrigin,
  extractFirmSlugFromHost,
  isReservedFirmSlug,
  needsFirmHostRedirect,
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

  it('builds firm origin on production apex login', () => {
    expect(
      buildFirmAppOrigin({
        firmSlug: 'thesiambarrister',
        currentHost: 'samnaun.com',
        protocol: 'https:',
      }),
    ).toBe('https://thesiambarrister.samnaun.com');
  });

  it('builds firm origin for localhost with port', () => {
    expect(
      buildFirmAppOrigin({
        firmSlug: 'thesiambarrister',
        currentHost: 'localhost:3005',
        protocol: 'http:',
      }),
    ).toBe('http://thesiambarrister.localhost:3005');
  });

  it('needs redirect from apex but not from matching firm host', () => {
    expect(needsFirmHostRedirect('samnaun.com', 'thesiambarrister')).toBe(true);
    expect(needsFirmHostRedirect('thesiambarrister.samnaun.com', 'thesiambarrister')).toBe(false);
    expect(needsFirmHostRedirect('localhost:3005', 'thesiambarrister')).toBe(true);
    expect(needsFirmHostRedirect('thesiambarrister.localhost:3005', 'thesiambarrister')).toBe(
      false,
    );
  });
});
