import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuoteHtml } from './quote-doc.ts';

const base = {
  firmName: 'สำนักงานทดสอบ',
  issuedByName: 'สมชาย ใจดี',
  clientName: 'ลูกความ <b>หนึ่ง</b>',
  matterTitle: 'ผิดสัญญา',
  matterTypeLabel: 'แพ่ง',
  opposingParty: 'บริษัท ก.',
  estimatedDamage: 500000,
  lines: [{ label: 'ค่าบริการคดี', quantity: '2', rate: '10000' }],
};

test('renders totals and escapes html', () => {
  const html = buildQuoteHtml(base, new Date('2026-09-20'));
  assert.ok(html.includes('20,000 บาท')); // 2 × 10,000
  assert.ok(html.includes('&lt;b&gt;หนึ่ง&lt;/b&gt;'));
  assert.ok(!html.includes('<b>หนึ่ง</b>'));
  assert.ok(html.includes('500,000 บาท'));
  assert.ok(html.includes('สำนักงานทดสอบ'));
});

test('omits blank info rows and flags incomplete totals', () => {
  const html = buildQuoteHtml({
    ...base,
    opposingParty: '',
    estimatedDamage: null,
    lines: [{ label: 'ค่าไปศาล', quantity: '1', rate: '' }],
  });
  assert.ok(!html.includes('คู่กรณี'));
  assert.ok(!html.includes('ทุนทรัพย์'));
  assert.ok(html.includes('เฉพาะรายการที่ระบุครบ'));
});
