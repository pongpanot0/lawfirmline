import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFirmHandoffUrl,
  shouldRedirectAfterLogin,
} from './firm-slug.ts';

describe('post-login firm redirect', () => {
  it('redirects from apex to firm handoff with tokens in hash', () => {
    const url = buildFirmHandoffUrl({
      firmSlug: 'thesiambarristers',
      currentHost: 'samnaun.com',
      protocol: 'https:',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      nextPath: '/dashboard',
    });
    assert.equal(
      url,
      'https://thesiambarristers.samnaun.com/handoff#access_token=access-1&refresh_token=refresh-1&next=%2Fdashboard',
    );
  });

  it('uses localhost subdomain in development', () => {
    const url = buildFirmHandoffUrl({
      firmSlug: 'thesiambarristers',
      currentHost: 'localhost:3005',
      protocol: 'http:',
      accessToken: 'a',
      refreshToken: 'r',
    });
    assert.match(url, /^http:\/\/thesiambarristers\.localhost:3005\/handoff#/);
  });

  it('skips redirect when already on firm host', () => {
    assert.equal(
      shouldRedirectAfterLogin('thesiambarristers.samnaun.com', 'thesiambarristers'),
      false,
    );
    assert.equal(shouldRedirectAfterLogin('samnaun.com', 'thesiambarristers'), true);
  });
});
