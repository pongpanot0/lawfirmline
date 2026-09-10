import {
  DEFAULT_ROOT_DOMAIN,
  buildFirmAppOrigin,
  extractFirmSlugFromHost,
  isReservedFirmSlug,
  needsFirmHostRedirect,
} from '@lawfirm/shared';

describe('firm slug helpers', () => {
  it('extracts tenant slug from samnaun.com subdomain', () => {
    expect(extractFirmSlugFromHost('thesiambarristers.samnaun.com', DEFAULT_ROOT_DOMAIN)).toBe(
      'thesiambarristers',
    );
  });

  it('returns null for apex and www', () => {
    expect(extractFirmSlugFromHost('samnaun.com')).toBeNull();
    expect(extractFirmSlugFromHost('www.samnaun.com')).toBeNull();
    expect(extractFirmSlugFromHost('api.samnaun.com')).toBeNull();
  });

  it('supports localhost subdomain for development', () => {
    expect(extractFirmSlugFromHost('thesiambarristers.localhost:3005')).toBe('thesiambarristers');
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
        firmSlug: 'thesiambarristers',
        currentHost: 'samnaun.com',
        protocol: 'https:',
      }),
    ).toBe('https://thesiambarristers.samnaun.com');
  });

  it('builds firm origin for localhost with port', () => {
    expect(
      buildFirmAppOrigin({
        firmSlug: 'thesiambarristers',
        currentHost: 'localhost:3005',
        protocol: 'http:',
      }),
    ).toBe('http://thesiambarristers.localhost:3005');
  });

  it('needs redirect from apex but not from matching firm host', () => {
    expect(needsFirmHostRedirect('samnaun.com', 'thesiambarristers')).toBe(true);
    expect(needsFirmHostRedirect('thesiambarristers.samnaun.com', 'thesiambarristers')).toBe(false);
    expect(needsFirmHostRedirect('localhost:3005', 'thesiambarristers')).toBe(true);
    expect(needsFirmHostRedirect('thesiambarristers.localhost:3005', 'thesiambarristers')).toBe(
      false,
    );
  });
});
