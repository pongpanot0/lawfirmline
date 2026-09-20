#!/usr/bin/env node
/**
 * Renders docs/user-guide/index.html (built by build-deck.mjs) to a paginated
 * PDF at docs/user-guide/Samnuan-คู่มือการใช้งาน.pdf using a headless Chromium
 * page — the same engine Playwright drives for the guide screenshots.
 *
 *   node e2e/build-pdf.mjs
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUIDE = path.resolve(HERE, '../docs/user-guide');
const OUT = path.join(GUIDE, 'Samnuan-คู่มือการใช้งาน.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${path.join(GUIDE, 'index.html')}`, { waitUntil: 'networkidle' });
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '10mm', right: '10mm' },
});
await browser.close();
console.log(`built ${OUT}`);
