import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictMatchesFrom, describeConflictMatch } from './conflict.ts';

/** Same shape as ApiError (status + parsed body); api.ts itself is not importable under node --test. */
const apiError = (status: number, body: unknown) => Object.assign(new Error('x'), { status, body });
const match = { kind: 'CASE_PARTY', term: 'บริษัท ก', name: 'บริษัท ก จำกัด', side: 'OPPONENT', role: 'DEFENDANT', caseId: 'c9', caseTitle: 'คดีเก่า', ownRef: 'REF9' };

test('reads the matches out of a 409 CONFLICT_FOUND', () => {
  assert.deepEqual(conflictMatchesFrom(apiError(409, { code: 'CONFLICT_FOUND', matches: [match] })), [match]);
});

test('anything else is not a conflict prompt', () => {
  assert.equal(conflictMatchesFrom(apiError(409, { message: 'Own Ref taken' })), null);
  assert.equal(conflictMatchesFrom(apiError(400, { code: 'CONFLICT_FOUND', matches: [] })), null);
  assert.equal(conflictMatchesFrom(new Error('network')), null);
});

test('describes where the name was found and on which side', () => {
  assert.equal(describeConflictMatch(match), 'บริษัท ก จำกัด — ฝ่ายตรงข้ามในคดี REF9 คดีเก่า');
  assert.equal(
    describeConflictMatch({ kind: 'CLIENT', term: 'x', name: 'นาย ข', side: 'OURS' }),
    'นาย ข — ลูกความของสำนักงาน',
  );
  assert.equal(
    describeConflictMatch({ kind: 'INTAKE_PARTY', term: 'x', name: 'นาย ค', side: 'OPPONENT', intakeTitle: 'เรื่องใหม่' }),
    'นาย ค — ฝ่ายตรงข้ามในเรื่องรับใหม่ เรื่องใหม่',
  );
});
