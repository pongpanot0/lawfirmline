import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { classifySeoHost, privatePaths, serializeJsonLd } from './seo.ts';

describe('SEO host classification', () => {
  for (const host of ['samnuan.com', 'SAMNUAN.COM:443', 'samnuan.com.']) {
    it(`allows the apex ${host}`, () => {
      assert.equal(classifySeoHost(host, 'samnuan.com'), 'apex');
    });
  }
  for (const host of ['www.samnuan.com', 'office.samnuan.com', 'api.samnuan.com', 'samnuan.com.evil.test', 'other.test', null]) {
    it(`disallows the non-apex host ${host}`, () => {
      assert.equal(classifySeoHost(host, 'samnuan.com'), 'other');
    });
  }
  for (const host of ['localhost:3005', 'office.localhost:3005', '127.0.0.1:3005', '[::1]:3005']) {
    it(`allows development host ${host}`, () => {
      assert.equal(classifySeoHost(host, 'samnuan.com'), 'development');
    });
  }
  it('uses the configured root instead of hardcoding production', () => {
    assert.equal(classifySeoHost('example.test', 'example.test'), 'apex');
    assert.equal(classifySeoHost('samnuan.com', 'example.test'), 'other');
  });
});

it('keeps public indexable paths out of robots exclusions', () => {
  for (const path of ['/', '/register', '/privacy']) {
    assert.equal(privatePaths.some((prefix) => path.startsWith(prefix)), false);
  }
});

it('excludes every dashboard route root from crawling', () => {
  const routes = readdirSync(new URL('../app/(dashboard)/', import.meta.url), { withFileTypes: true });
  for (const route of routes.filter((entry) => entry.isDirectory())) {
    assert.ok(privatePaths.some((path) => path === `/${route.name}` || path === `/${route.name}/`), route.name);
  }
});

it('escapes script terminators without changing JSON-LD values', () => {
  const value = { description: '</script><script>alert(1)</script>' };
  const serialized = serializeJsonLd(value);
  assert.equal(serialized.includes('<'), false);
  assert.deepEqual(JSON.parse(serialized), value);
});
