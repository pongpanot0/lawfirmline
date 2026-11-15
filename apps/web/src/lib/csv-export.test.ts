import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCasesCsv, buildClientsCsv, buildInvoicesCsv, buildTimesheetCsv } from './csv-export.ts';
import type { CaseListItem, ClientItem, FirmInvoiceItem, FirmTimesheetEntry } from './api.ts';

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

test('invoices: BOM, Bangkok ISO dates, plain amounts, Thai status, formula guard', () => {
  const csv = buildInvoicesCsv([{
    id: 'i1', invoiceNumber: 'INV-001', status: 'SENT', totalAmount: 12345.5,
    issuedAt: '2026-11-14T18:30:00.000Z', dueAt: null, ownRef: 'C-1', clientName: '=HYPERLINK("x")', customerName: 'บริษัท ก',
  } as FirmInvoiceItem]);
  assert.ok(csv.startsWith('﻿'));
  const [head, row] = lines(csv);
  assert.match(head, /^เลขที่ใบแจ้งหนี้,สถานะ/);
  assert.equal(row, 'INV-001,ส่งแล้ว รอชำระ,2026-11-15,,บริษัท ก,"\'=HYPERLINK(""x"")",C-1,,12345.50');
});

test('timesheet: sorted by date, value = hours × rate, flags in Thai', () => {
  const e = (date: string, hours: number): FirmTimesheetEntry => ({
    id: date, date, hours, rate: 2000, description: 'ร่างคำฟ้อง', billable: true, caseId: 'c', caseRef: 'C-1',
    userId: 'u', userName: 'สมชาย ใจดี', invoiced: false, writtenOff: false,
  });
  const [, first, second] = lines(buildTimesheetCsv([e('2026-11-03T00:00:00.000Z', 1.5), e('2026-11-01T00:00:00.000Z', 0.25)]));
  assert.equal(first, '2026-11-01,สมชาย ใจดี,C-1,ร่างคำฟ้อง,0.25,2000.00,500.00,ใช่,ไม่,ไม่');
  assert.match(second, /^2026-11-03,.*,1\.50,2000\.00,3000\.00,/);
});

test('clients: primary contact wins, type in Thai, leading + guarded', () => {
  const [, row] = lines(buildClientsCsv([{
    id: 'c1', name: 'บริษัท ข จำกัด', type: 'COMPANY', taxId: '0105551234567', openCaseCount: 2,
    contacts: [{ name: 'คนแรก', phone: '0811111111' }, { name: 'ผู้จัดการ', phone: '+66 81 222 2222', email: 'm@x.co', isPrimary: true }],
  } as ClientItem]));
  assert.equal(row, "บริษัท ข จำกัด,นิติบุคคล,0105551234567,,,,,ผู้จัดการ,'+66 81 222 2222,m@x.co,2,");
});

test('cases: claimed amount, type, opened/closed, limitation and next hearing columns', () => {
  const c = {
    id: 'k1', ownRef: 'C-9', title: 'ผิดสัญญา', status: 'OPEN', leadLawyer: { firstName: 'ก', lastName: 'ข' },
    claimedAmount: 1500000, caseType: { id: 't', name: 'แพ่ง' }, openedAt: '2026-01-10T03:00:00.000Z', closedAt: null,
    limitationDeadline: '2027-01-09T17:00:00.000Z', participants: [],
  } as unknown as CaseListItem;
  const [head, row] = lines(buildCasesCsv([c], { statusLabel: () => 'เปิด', nextCourtDate: (id) => (id === 'k1' ? '2026-12-01T02:00:00.000Z' : null) }));
  assert.match(head, /ประเภทคดี,ทุนทรัพย์,.*,วันที่เปิดคดี,วันที่ปิดคดี,ครบอายุความ,นัดศาลครั้งถัดไป$/);
  assert.match(row, /,แพ่ง,1500000\.00,/);
  assert.match(row, /,เปิด,,2026-01-10,,2027-01-10,2026-12-01$/);
});
