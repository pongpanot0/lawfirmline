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
  assert.ok(buildBillingDocHtml(base).includes('ใบแจ้งหนี้'));
  assert.ok(!buildBillingDocHtml(base).includes('ข้อมูลการชำระเงิน'));
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

test('Thai amount words handle satang, tens and millions', async () => {
  const { bahtText } = await import('./billing-doc.ts');
  assert.equal(bahtText(0), 'ศูนย์บาทถ้วน');
  assert.equal(bahtText(21), 'ยี่สิบเอ็ดบาทถ้วน');
  assert.equal(bahtText(21.01), 'ยี่สิบเอ็ดบาทหนึ่งสตางค์');
  assert.equal(bahtText(1000001.5), 'หนึ่งล้านเอ็ดบาทห้าสิบสตางค์');
});

test('receipt uses frozen firm, payment and void reason safely', async () => {
  const { buildReceiptDocHtml } = await import('./billing-doc.ts');
  const data = {
    receiptNumber: 'RC-1', issuedAt: '2026-11-15', isTaxInvoice: true,
    firmSnapshot: { legalName: 'Frozen firm', taxId: '1234567890123', taxBranch: '00000', address: 'Address', logoKey: null },
    customer: { name: 'Customer', taxId: '0105545098761', branch: '00001' },
    invoice: { invoiceNumber: 'INV-1', totalAmount: 107, lineItems: [{ description: 'Fee', quantity: 1, unitPrice: 100, amount: 100, taxClass: 'ADVISORY_VAT' }], case: null, intake: null },
    totals: { totalAmount: 53, discountAmount: 0, amountExempt: 0, amountTaxable: 49.53, amountVat: 3.47, amountDisbursement: 0, amountReceived: 50, amountWht: 3, vatAmount: 3.47, vatRate: 0.07, amount: 50, whtAmount: 3 },
    payment: { method: 'TRANSFER', receivedAt: '2026-11-15', note: null, whtCertificateNo: null },
    voidedAt: '2026-11-16', voidReason: '<reason>',
  } as unknown as import('./api').ReceiptPrintData;
  const html = buildReceiptDocHtml(data, undefined, undefined, 54);
  assert.ok(html.includes('Frozen firm'));
  assert.ok(html.includes('ใบเสร็จรับเงิน/ใบกำกับภาษี'));
  assert.ok(html.includes('ยกเลิกแล้ว: &lt;reason&gt;'));
  assert.ok(html.includes('50.00 บาท'));
  assert.ok(html.includes('49.53 บาท'));
  assert.ok(html.includes('3.47 บาท'));
  assert.ok(html.includes('ชำระครั้งนี้ 53.00 บาท จากยอด 107.00 บาท (คงค้าง 54.00 บาท)'));
  assert.ok(!html.includes('มูลค่ายกเว้นภาษี'));
  assert.ok(!html.includes('เงินจ่ายแทน'));
  assert.ok(!html.includes('หนังสือรับรอง (50 ทวิ)'));
  assert.ok(html.includes('เลขประจำตัวผู้เสียภาษี 0105545098761 · สาขาที่ 00001'));
  assert.ok(html.includes('ห้าสิบสามบาทถ้วน'));
  assert.ok(buildReceiptDocHtml(data, undefined, 'RC-0', 20).includes('คงค้าง 20.00 บาท'));
  assert.ok(buildReceiptDocHtml(data, undefined, 'RC-0', 20).includes('ออกแทน RC-0'));
});


test('withholding suggestion uses the capped share of invoice fees', async () => {
  const { suggestWht } = await import('./billing-doc.ts');
  assert.equal(suggestWht(0.03, 100000, 25000, 1000, 60000, 100000), 780);
  assert.equal(suggestWht(0.03, 100000, 60000, 1000, 60000, 100000), 1800);
});
