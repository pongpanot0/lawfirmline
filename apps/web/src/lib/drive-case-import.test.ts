import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { draftFromSuggestion, draftProblem, toImportRow, type ImportCaseDraft } from './drive-case-import.ts';
import type { ParsedCaseFolder } from './api.ts';

const parsed = (extra: Partial<ParsedCaseFolder> = {}): ParsedCaseFolder => ({
  title: 'คำให้การ - พ264.69',
  blackCaseNumber: 'พ264/2569',
  caseNumberRaw: 'พ264.69',
  courtName: 'ศ.แพ่ง',
  courtLevel: 'TRIAL',
  closed: false,
  outcome: null,
  teamHint: 'โบ, พี่ปิง',
  ...extra,
});
const suggestion = (name: string, suggestions: unknown[] = [], extra: Partial<ParsedCaseFolder> = {}) => ({
  folder: { id: 'F1', name },
  parsed: parsed(extra),
  suggestions,
});

describe('draftFromSuggestion', () => {
  it('pre-fills from the parsed name and leaves the lead for a person to pick', () => {
    assert.deepEqual(draftFromSuggestion(suggestion('89. คำให้การ - พ264.69')), {
      selected: true,
      folderName: '89. คำให้การ - พ264.69',
      caseNumberRaw: 'พ264.69',
      teamHint: 'โบ, พี่ปิง',
      itemId: 'F1',
      title: 'คำให้การ - พ264.69',
      blackCaseNumber: 'พ264/2569',
      courtName: 'ศ.แพ่ง',
      courtLevel: 'TRIAL',
      leadLawyerId: '',
      buddyIds: [],
      closed: false,
      outcome: undefined,
      closingSummary: 'นำเข้าจาก OneDrive: 89. คำให้การ - พ264.69',
    });
  });

  it('only ticks numbered folders that match no existing case', () => {
    assert.equal(draftFromSuggestion(suggestion('B. คดีทางการแพทย์')).selected, false);
    assert.equal(draftFromSuggestion(suggestion('แบบฟอร์มศาล')).selected, false);
    assert.equal(draftFromSuggestion(suggestion('89. คำให้การ', [{ caseId: 'c1' }])).selected, false);
  });

  it('carries a closed/withdrawn reading through', () => {
    const draft = draftFromSuggestion(suggestion('76. ถอนฟ้อง', [], { closed: true, outcome: 'WITHDRAWN' }));
    assert.equal(draft.closed, true);
    assert.equal(draft.outcome, 'WITHDRAWN');
  });
});

describe('draftProblem', () => {
  const ok: ImportCaseDraft = { ...draftFromSuggestion(suggestion('89. คำให้การ')), leadLawyerId: 'lead' };

  it('accepts a complete draft', () => {
    assert.equal(draftProblem(ok), null);
    assert.equal(draftProblem({ ...ok, blackCaseNumber: '' }), null);
    assert.equal(draftProblem({ ...ok, closed: true, outcome: 'WON' }), null);
  });

  it('names what is missing', () => {
    assert.equal(draftProblem({ ...ok, leadLawyerId: '' }), 'ยังไม่ได้เลือกทนายหลัก');
    assert.equal(draftProblem({ ...ok, title: '  ' }), 'ชื่อคดีว่าง');
    assert.equal(draftProblem({ ...ok, blackCaseNumber: 'พ264.69' }), 'เลขคดีไม่ถูกรูปแบบ');
    assert.equal(draftProblem({ ...ok, closed: true, outcome: undefined }), 'เลือกผลคดี');
    assert.equal(draftProblem({ ...ok, closed: true, outcome: 'WON', closingSummary: 'สั้น' }), 'สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร');
  });
});

describe('toImportRow', () => {
  const draft: ImportCaseDraft = { ...draftFromSuggestion(suggestion('89. คำให้การ')), leadLawyerId: 'lead', buddyIds: ['lead', 'b1'] };

  it('drops blank optionals, the lead from the team, and closed fields on an open row', () => {
    const row = toImportRow({ ...draft, blackCaseNumber: ' ', courtName: '', outcome: 'WON' });
    assert.equal(row.blackCaseNumber, undefined);
    assert.equal(row.courtName, undefined);
    assert.deepEqual(row.buddyIds, ['b1']);
    assert.equal(row.outcome, undefined);
    assert.equal(row.closingSummary, undefined);
  });

  it('keeps outcome and trimmed summary on a closed row', () => {
    const row = toImportRow({ ...draft, closed: true, outcome: 'WITHDRAWN', closingSummary: '  นำเข้าจาก OneDrive: 76  ' });
    assert.equal(row.outcome, 'WITHDRAWN');
    assert.equal(row.closingSummary, 'นำเข้าจาก OneDrive: 76');
  });
});
