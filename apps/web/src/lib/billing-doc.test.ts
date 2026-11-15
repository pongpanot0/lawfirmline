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
  const { STANDARD_V1_LAYOUT } = await import('@lawfirm/shared');
  assert.equal(html, buildReceiptDocHtml({ ...data, templateSnapshot: { layout: STANDARD_V1_LAYOUT, logoKey: null } }, undefined, undefined, 54));
  const customReceipt = buildReceiptDocHtml({ ...data, templateSnapshot: { logoKey: null, layout: { version: 1, blocks: [{ id: 'items', type: 'items', column: 'full', settings: { columns: ['description'], groupByTaxClass: true } }] } } });
  assert.ok(customReceipt.includes('รายการตามใบแจ้งหนี้ INV-1'));
  assert.ok(customReceipt.includes('ค่าวิชาชีพ'));
  assert.ok(!customReceipt.includes('<th>จำนวนเงิน</th>'));
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

test('standard layout preserves invoice output', async () => {
  const { STANDARD_V1_LAYOUT } = await import('@lawfirm/shared');
  assert.equal(buildBillingDocHtml(base), buildBillingDocHtml({ ...base, templateSnapshot: { layout: STANDARD_V1_LAYOUT, logoKey: null } }));
});

test('custom layout pairs columns, honours hidden (server enforces VAT blocks) and renders payment details', () => {
  const html = buildBillingDocHtml({ ...base, templateSnapshot: { logoKey: null, layout: { version: 1, blocks: [
    { id: 'n', type: 'note', column: 'left', settings: { text: 'ข้อความ <สำคัญ>' } },
    { id: 'b', type: 'bank', column: 'right', settings: { bankName: 'ธนาคาร', accountName: 'บัญชี', accountNo: '123' } },
    { id: 'h', type: 'words', column: 'full', hidden: true },
    { id: 'c', type: 'customer', column: 'full', hidden: true },
    { id: 'p', type: 'promptpay', column: 'full', settings: { promptpayId: '0812345678', fontSize: 'lg' } },
  ] } } });
  assert.ok(html.includes('font-size:16px'));
  assert.match(html, /template-row"><div><div><section>ข้อความ &lt;สำคัญ&gt;<\/section><\/div><\/div><div><div><section><b>ข้อมูลบัญชีธนาคาร/);
  assert.ok(html.includes('บัญชี') && html.includes('123'));
  assert.ok(!html.includes('จำนวนเงินตัวอักษร'));
  assert.ok(!html.includes('เรียกเก็บจาก / ผู้ว่าจ้าง'));
  assert.ok(html.includes('สแกนจ่ายผ่านแอปธนาคาร') && html.includes('คิวอาร์พร้อมเพย์'));
});


test('item settings select columns and group fees and disbursements', () => {
  const lines = [
    { description: 'ค่าใช้จ่าย', quantity: 2, unitPrice: 25, amount: 50, taxClass: 'DISBURSEMENT' as const },
    { description: 'ค่าทนาย <test>', quantity: 3, unitPrice: 100, amount: 300, taxClass: 'LITIGATION_EXEMPT' as const },
  ];
  const html = buildBillingDocHtml({ ...base, lines, templateSnapshot: { logoKey: null, layout: { version: 1, blocks: [
    { id: 'items', type: 'items', column: 'full', settings: { columns: ['description', 'quantity', 'unitPrice'], groupByTaxClass: true } },
  ] } } });
  assert.match(html, /<th>รายการ<\/th><th>จำนวน<\/th><th>ราคาต่อหน่วย<\/th>/);
  assert.ok(!html.includes('<th>ประเภทภาษี</th>'));
  assert.ok(!html.includes('<th>จำนวนเงิน</th>'));
  assert.ok(html.indexOf('ค่าวิชาชีพ') < html.indexOf('ค่าทนาย &lt;test&gt;'));
  assert.ok(html.indexOf('ค่าทนาย &lt;test&gt;') < html.indexOf('เงินจ่ายแทนลูกความ'));
  assert.ok(html.includes('100.00 บาท'));
  assert.ok(!html.includes('data-block='));
});

test('invoice firm tax identifies head office and branches', () => {
  const firmProfile = { legalName: 'Firm', billingAddress: '', taxId: '0105566012345', taxBranch: '00000' };
  assert.ok(buildBillingDocHtml({ ...base, firmProfile }).includes('เลขประจำตัวผู้เสียภาษี 0105566012345 (สำนักงานใหญ่)'));
  assert.ok(buildBillingDocHtml({ ...base, firmProfile: { ...firmProfile, taxBranch: '00001' } }).includes('เลขประจำตัวผู้เสียภาษี 0105566012345 สาขาที่ 00001'));
});

test('sent invoice prints the issuer details frozen at send, not the live profile', async () => {
  const { STANDARD_V1_LAYOUT } = await import('@lawfirm/shared');
  const html = buildBillingDocHtml({ ...base, firmProfile: { legalName: 'ชื่อใหม่', billingAddress: 'ที่อยู่ใหม่', taxId: '9999999999999', taxBranch: '00000' },
    templateSnapshot: { layout: STANDARD_V1_LAYOUT, logoKey: null, firm: { legalName: 'ชื่อตอนส่ง', address: 'ที่อยู่ตอนส่ง', taxId: '0105566012345', taxBranch: '00001' } } });
  assert.ok(html.includes('ชื่อตอนส่ง') && html.includes('0105566012345') && html.includes('สาขาที่ 00001'));
  assert.ok(!html.includes('ชื่อใหม่'));
});

test('grouped item rows keep one running sequence', () => {
  const html = buildBillingDocHtml({ ...base, lines: [
    { description: 'A', quantity: 1, unitPrice: 1, amount: 1, taxClass: 'LITIGATION_EXEMPT' },
    { description: 'B', quantity: 1, unitPrice: 1, amount: 1, taxClass: 'DISBURSEMENT' },
    { description: 'C', quantity: 1, unitPrice: 1, amount: 1, taxClass: 'ADVISORY_VAT' },
  ], templateSnapshot: { logoKey: null, layout: { version: 1, blocks: [{ id: 'i', type: 'items', column: 'full', settings: { groupByTaxClass: true } }] } } });
  const nums = [...html.matchAll(/<tr><td>(\d+)<\/td><td>([ABC])<\/td>/g)].map(m => m[2] + m[1]);
  assert.deepEqual(nums, ['A1', 'C2', 'B3']);
});

test('annotation is opt-in and leaves standard print output unchanged', async () => {
  const { STANDARD_V1_LAYOUT } = await import('@lawfirm/shared');
  const data = { ...base, templateSnapshot: { layout: STANDARD_V1_LAYOUT, logoKey: null } };
  assert.equal(buildBillingDocHtml(data, { annotate: false }), buildBillingDocHtml(base));
  assert.match(buildBillingDocHtml(data, { annotate: true }), /data-block="/);
});
