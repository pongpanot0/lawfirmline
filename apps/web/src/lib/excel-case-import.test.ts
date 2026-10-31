import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { excelRowProblems, toCreateRow } from './excel-case-import.ts';
import type { ExcelCaseDraft } from './api.ts';

const draft = (extra: Partial<ExcelCaseDraft> = {}): ExcelCaseDraft => ({
  rowNumber: 2,
  problems: [],
  title: 'คดี A',
  leadEmail: 'anan@firm.co',
  leadLawyerId: 'u-anan',
  buddyIds: [],
  courtLevel: 'TRIAL',
  clientMatched: false,
  opponents: [],
  closed: false,
  ...extra,
});

describe('excelRowProblems', () => {
  it('re-checks the fields the table can edit', () => {
    assert.deepEqual(excelRowProblems(draft({ title: ' ' })), ['ยังไม่ได้กรอกชื่อคดี']);
    assert.deepEqual(excelRowProblems(draft({ leadLawyerId: '' })), ['ยังไม่ได้เลือกทนายหลัก']);
    assert.deepEqual(excelRowProblems(draft({ blackCaseNumber: '264.69' })), ['เลขคดีดำไม่ถูกรูปแบบ']);
    assert.deepEqual(excelRowProblems(draft({ redCaseNumber: 'x' })), ['เลขคดีแดงไม่ถูกรูปแบบ']);
    assert.deepEqual(excelRowProblems(draft({ closed: true, closingSummary: 'สรุปยาวพอแล้วครับ' })), ['เลือกผลคดีของคดีที่ปิดแล้ว']);
    assert.deepEqual(excelRowProblems(draft({ closed: true, outcome: 'WON', closingSummary: 'สั้น' })), ['สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร']);
    assert.deepEqual(excelRowProblems(draft()), []);
  });

  it('clears a server problem once the field is fixed in the table', () => {
    const fixed = draft({ title: 'คดี A', problems: ['ยังไม่ได้กรอกชื่อคดี', 'ไม่พบทนายอีเมล x@y.co ในสำนักงาน'] });
    assert.deepEqual(excelRowProblems(fixed), []);
  });

  it('keeps problems on fields the table cannot edit, and duplicates', () => {
    const d = draft({ problems: ['ไม่พบประเภทคดี คดีอาญา', 'มีคดีนี้ในระบบแล้ว (TSB-1)', 'วันเปิดคดีไม่ถูกต้อง'] });
    assert.deepEqual(excelRowProblems(d), ['ไม่พบประเภทคดี คดีอาญา', 'มีคดีนี้ในระบบแล้ว (TSB-1)', 'วันเปิดคดีไม่ถูกต้อง']);
  });
});

describe('toCreateRow', () => {
  it('drops display-only fields and closed fields on an open row', () => {
    const row = toCreateRow(draft({ problems: ['x'], outcome: 'WON', closingSummary: 'ignored summary', closedAt: '2025-01-01' }));
    assert.equal('problems' in row, false);
    assert.equal('leadEmail' in row, false);
    assert.equal('clientMatched' in row, false);
    assert.equal(row.outcome, undefined);
    assert.equal(row.closingSummary, undefined);
    assert.equal(row.closedAt, undefined);
    assert.equal(row.rowNumber, 2);
  });

  it('drops a stage on a closed row', () => {
    const row = toCreateRow(draft({ closed: true, outcome: 'WON', closingSummary: 'สรุปยาวพอแล้วครับ', stage: 'HEARING' }));
    assert.equal(row.stage, undefined);
    assert.equal(row.outcome, 'WON');
  });
});
