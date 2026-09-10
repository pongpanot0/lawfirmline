import {
  DEFAULT_ROOT_DOMAIN,
  buildFirmAppOrigin,
  extractFirmSlugFromHost,
  isReservedFirmSlug,
  needsFirmHostRedirect,
} from '@lawfirm/shared';

describe('firm slug helpers', () => {
  it('extracts tenant slug from samnuan.com subdomain', () => {
    expect(extractFirmSlugFromHost('thesiambarristers.samnuan.com', DEFAULT_ROOT_DOMAIN)).toBe(
      'thesiambarristers',
    );
  });

  it('returns null for apex and www', () => {
    expect(extractFirmSlugFromHost('samnuan.com')).toBeNull();
    expect(extractFirmSlugFromHost('www.samnuan.com')).toBeNull();
    expect(extractFirmSlugFromHost('api.samnuan.com')).toBeNull();
  });

  it('supports localhost subdomain for development', () => {
    expect(extractFirmSlugFromHost('thesiambarristers.localhost:3005')).toBe('thesiambarristers');
  });

  it('rejects reserved slugs', () => {
    expect(isReservedFirmSlug('www')).toBe(true);
    expect(isReservedFirmSlug('api')).toBe(true);
    expect(extractFirmSlugFromHost('www.samnuan.com')).toBeNull();
    expect(extractFirmSlugFromHost('api.samnuan.com')).toBeNull();
  });

  it('builds firm origin on production apex login', () => {
    expect(
      buildFirmAppOrigin({
        firmSlug: 'thesiambarristers',
        currentHost: 'samnuan.com',
        protocol: 'https:',
      }),
    ).toBe('https://thesiambarristers.samnuan.com');
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
    expect(needsFirmHostRedirect('samnuan.com', 'thesiambarristers')).toBe(true);
    expect(needsFirmHostRedirect('thesiambarristers.samnuan.com', 'thesiambarristers')).toBe(false);
    expect(needsFirmHostRedirect('localhost:3005', 'thesiambarristers')).toBe(true);
    expect(needsFirmHostRedirect('thesiambarristers.localhost:3005', 'thesiambarristers')).toBe(
      false,
    );
  });
});
