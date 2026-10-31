import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginReturnPath } from './login-return.ts';
import { buildFirmHandoffUrl } from './firm-slug.ts';

test('keeps a scanned folder and its query/hash through login', () => {
  const path = '/f/LF-2026-ABC123?from=qr#actions';
  assert.equal(loginReturnPath(`?next=${encodeURIComponent(path)}`), path);
});

test('rejects external destinations, backslashes, control characters and auth loops', () => {
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nevil', '/login', '/login/?next=/f/a', '/handoff', '/a/../login']) {
    assert.equal(loginReturnPath(`?next=${encodeURIComponent(path)}`), '/dashboard', path);
  }
  assert.equal(loginReturnPath(''), '/dashboard');
});

test('carries the scanned folder through the existing firm-subdomain handoff', () => {
  const path = '/f/LF-2026-ABC123';
  const handoff = new URL(buildFirmHandoffUrl({
    firmSlug: 'office', currentHost: 'samnuan.com', protocol: 'https:',
    accessToken: 'test-access', refreshToken: 'test-refresh',
    nextPath: loginReturnPath(`?next=${encodeURIComponent(path)}`),
  }));
  assert.equal(handoff.host, 'office.samnuan.com');
  assert.equal(new URLSearchParams(handoff.hash.slice(1)).get('next'), path);
});
