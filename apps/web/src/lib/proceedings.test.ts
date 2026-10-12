import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgmentLine, proceedingNumbers, sortProceedings } from './proceedings.ts';

const row = (over: object) => ({
  id: 'p', caseId: 'c', courtLevel: 'TRIAL', courtName: null, blackCaseNumber: null, redCaseNumber: null,
  filedAt: null, judgmentAt: null, judgmentOutcome: null, judgmentAmount: null, judgmentNote: null, ...over,
}) as never;

test('proceedings sort trial → appeal → supreme', () => {
  const sorted = sortProceedings([row({ courtLevel: 'SUPREME' }), row({ courtLevel: 'TRIAL' }), row({ courtLevel: 'APPEAL' })]);
  assert.deepEqual(sorted.map((p: { courtLevel: string }) => p.courtLevel), ['TRIAL', 'APPEAL', 'SUPREME']);
});

test('numbers line shows what exists', () => {
  assert.equal(proceedingNumbers(row({ blackCaseNumber: 'พ.1/2569', redCaseNumber: 'พ.9/2570' })), 'ดำ พ.1/2569 · แดง พ.9/2570');
  assert.equal(proceedingNumbers(row({ blackCaseNumber: 'พ.1/2569' })), 'ดำ พ.1/2569');
  assert.equal(proceedingNumbers(row({})), 'ยังไม่มีเลขคดี');
});

test('judgment line reads outcome and amount (Decimal arrives as a string)', () => {
  assert.equal(judgmentLine(row({})), null);
  assert.equal(
    judgmentLine(row({ judgmentAt: '2026-10-12T03:00:00.000Z', judgmentOutcome: 'WON', judgmentAmount: '500000.00' })),
    'พิพากษา 12/10/2569 · ชนะคดี · 500,000.00 บาท',
  );
});
