import { test as base } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Authentication moves to the firm's origin. Follow the origin observed by
// setup instead of assuming the apex host shares its localStorage session.
export const test = base.extend({
  baseURL: async ({}, use) => {
    const { origin } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.auth/tenant.json'), 'utf8'));
    await use(origin);
  },
});
export { expect, type Page, type Locator } from '@playwright/test';
