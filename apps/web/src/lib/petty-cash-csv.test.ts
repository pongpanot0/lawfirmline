import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPettyCashCsv, receiptPathFor, buildPettyCashPackage, buildPrintableClaim } from './petty-cash-csv.ts';
import { buildZip } from './zip.ts';
import type { ExpenseItem } from './api.ts';

const expense = (over: Partial<ExpenseItem> = {}): ExpenseItem =>
  ({
    id: 'exp-abcdef123',
    user: { id: 'u1', firstName: 'สมชาย', lastName: 'ทดสอบ' },
    date: '2026-08-17T00:00:00.000Z',
    amount: 1500,
    description: 'ค่าส่งเอกสาร',
    category: 'ค่าเดินทาง',
    status: 'DRAFT',
    receiptFilename: 'line-receipt.jpg',
    ...over,
  }) as ExpenseItem;

test('the CSV names the receipt file that ships alongside it', () => {
  const e = expense();
  const csv = buildPettyCashCsv({
    firmName: 'สำนักงาน',
    requesterName: 'สมชาย',
    expenses: [e],
    receiptPaths: new Map([[e.id, receiptPathFor(e)]]),
  });
  assert.match(csv, /ไฟล์ใบเสร็จ/);
  assert.match(csv, /ใบเสร็จ\/exp-abcdef123-17 ส\.ค\. 69-ค่าส่งเอกสาร\.jpg/);
});

test('a receipt that could not be fetched is flagged, not dropped', () => {
  const csv = buildPettyCashCsv({ firmName: 'f', requesterName: 'r', expenses: [expense()] });
  assert.match(csv, /ดาวน์โหลดไม่สำเร็จ/);
});

test('an expense without an attachment leaves the column empty', () => {
  const csv = buildPettyCashCsv({
    firmName: 'f',
    requesterName: 'r',
    expenses: [expense({ receiptFilename: null })],
  });
  assert.doesNotMatch(csv, /ดาวน์โหลดไม่สำเร็จ/);
});

test('receipt paths keep the original extension and stay unique per expense', () => {
  const a = receiptPathFor(expense({ id: 'aaaaaa1', receiptFilename: 'scan.PDF' }));
  const b = receiptPathFor(expense({ id: 'bbbbbb2' }));
  assert.match(a, /\.pdf$/);
  assert.notEqual(a, b);
});

test('receipt paths survive a description full of path characters', () => {
  const path = receiptPathFor(expense({ description: 'ค่า/ส่ง: เอกสาร*?"' }));
  assert.equal(path.split('/').length, 2, 'only the folder separator remains');
});

test('buildZip produces a readable archive with a correct central directory', async () => {
  const payload = new TextEncoder().encode('receipt-bytes');
  const blob = buildZip([{ name: 'ใบเสร็จ/a.jpg', data: payload }]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);

  assert.equal(view.getUint32(0, true), 0x04034b50, 'local file header');
  // End-of-central-directory is the last 22 bytes for an archive with no comment.
  const end = bytes.length - 22;
  const endView = new DataView(bytes.buffer, end);
  assert.equal(endView.getUint32(0, true), 0x06054b50, 'end of central directory');
  assert.equal(endView.getUint16(10, true), 1, 'one entry');
  const centralOffset = endView.getUint32(16, true);
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50, 'central directory header');
  const nameLength = view.getUint16(26, true);
  const dataStart = 30 + nameLength;
  assert.equal(new TextDecoder().decode(bytes.slice(30, dataStart)), 'ใบเสร็จ/a.jpg');
  assert.equal(
    new TextDecoder().decode(bytes.slice(dataStart, dataStart + payload.length)),
    'receipt-bytes',
  );
});


test('package contains printable sheet, CSV and exact original attachment bytes', async () => {
  const e = expense();
  const result = await buildPettyCashPackage({ firmName: 'f', requesterName: 'r', expenses: [e], fetchReceipt: async () => new Blob(['original-evidence']) });
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  const data = new DataView(bytes.buffer);
  const entries = new Map<string, string>();
  let offset = 0;
  while (data.getUint32(offset, true) === 0x04034b50) {
    const size = data.getUint32(offset + 18, true), nameLength = data.getUint16(offset + 26, true), extra = data.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extra;
    entries.set(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength)), new TextDecoder().decode(bytes.slice(start, start + size)));
    offset = start + size;
  }
  assert.equal(entries.size, 3);
  assert.match(entries.get('ใบเบิก.html')!, /ค่าส่งเอกสาร/);
  assert.equal(entries.get(receiptPathFor(e)), 'original-evidence');
  assert.equal(result.receipts, 1);
});
test('a missing attachment blocks the whole export', async () => {
  await assert.rejects(buildPettyCashPackage({ firmName: 'f', requesterName: 'r', expenses: [expense()], fetchReceipt: async () => { throw new Error('denied'); } }), /ยังไม่ได้ส่งออก/);
});
test('printable sheet escapes user HTML and CSV neutralizes formulas', () => {
  const e = expense({ description: '<img src=x onerror=alert(1)>' });
  const html = buildPrintableClaim({ firmName: '<script>', requesterName: 'r', expenses: [e], receiptPaths: new Map() });
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /&lt;img/);
  assert.match(buildPettyCashCsv({ firmName: 'f', requesterName: 'r', expenses: [expense({ description: '=1+1' })] }), /'=1\+1/);
});
