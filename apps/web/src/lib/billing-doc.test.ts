import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBillingDocHtml, type BillingDocData } from './billing-doc.ts';

const base: BillingDocData = {
  kind: 'INVOICE',
  firmName: 'สำนักงาน',
  invoiceNumber: 'INV-1',
  issuedAt: null,
  dueAt: null,
  matterLabel: 'คดี',
  billTo: null,
  lines: [{ description: 'ค่าทนาย', quantity: 1, unitPrice: 1000, amount: 1000 }],
  totalAmount: 900,
};

test('no discount line when discount is zero or absent', () => {
  assert.ok(!buildBillingDocHtml(base).includes('ส่วนลด'));
  assert.ok(!buildBillingDocHtml({ ...base, discountAmount: 0 }).includes('ส่วนลด'));
});

test('discount shows subtotal, discount with reason, and net total', () => {
  const html = buildBillingDocHtml({ ...base, discountAmount: 100, discountReason: 'ลูกค้าประจำ <b>' });
  assert.ok(html.includes('รวมก่อนหักส่วนลด'));
  assert.ok(html.includes('1,000.00 บาท'));
  assert.ok(html.includes('-100.00 บาท'));
  assert.ok(html.includes('ลูกค้าประจำ &lt;b&gt;'));
  assert.ok(html.includes('900.00 บาท'));
});
