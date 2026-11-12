import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveApprovalQueue, leaveDayEvents, leaveDecisionText, leaveFlagsForDate, leaveSummaryByPerson, leaveWarning } from './leave-flags.ts';

const base = { userId: 'u1', type: 'SICK' as const, startDate: '2026-10-01', endDate: '2026-10-05' };

test('approved leave covering the date flags ON_LEAVE', () => {
  const flags = leaveFlagsForDate([{ ...base, status: 'APPROVED' }], '2026-10-03');
  assert.equal(flags.get('u1')?.kind, 'ON_LEAVE');
  assert.equal(flags.get('u1')?.label, 'ลา · ลาป่วย');
});

test('pending leave covering the date flags PENDING', () => {
  const flags = leaveFlagsForDate([{ ...base, status: 'PENDING' }], '2026-10-03');
  assert.equal(flags.get('u1')?.kind, 'PENDING');
  assert.equal(flags.get('u1')?.label, 'ขอลา (รออนุมัติ)');
});

test('rejected leave is ignored', () => {
  const flags = leaveFlagsForDate([{ ...base, status: 'REJECTED' }], '2026-10-03');
  assert.equal(flags.size, 0);
});

test('date outside the leave range is not flagged', () => {
  const flags = leaveFlagsForDate([{ ...base, status: 'APPROVED' }], '2026-10-10');
  assert.equal(flags.size, 0);
});

test('approved wins over pending for the same person', () => {
  const flags = leaveFlagsForDate(
    [
      { ...base, status: 'PENDING' },
      { userId: 'u1', type: 'VACATION', status: 'APPROVED', startDate: '2026-10-01', endDate: '2026-10-05' },
    ],
    '2026-10-03',
  );
  assert.equal(flags.get('u1')?.kind, 'ON_LEAVE');
  assert.equal(flags.get('u1')?.label, 'ลา · ลาพักร้อน');
});

test('leaveWarning renders a Thai Buddhist Era date', () => {
  assert.equal(leaveWarning('สมชาย', '2026-10-03'), 'สมชาย ลาวันที่ 3/10/2569');
});

test('leaveWarning for a pending leave asks for confirmation instead of stating it as fact', () => {
  assert.equal(
    leaveWarning('สมชาย', '2026-10-03', 'PENDING'),
    'สมชาย ขอลาวันที่ 3/10/2569 (รออนุมัติ)',
  );
});

test('leaveApprovalQueue hides an approver\'s own pending leave unless they are the owner', () => {
  const leaves = [
    { ...base, id: 'a', userId: 'om', status: 'PENDING' as const },
    { ...base, id: 'b', userId: 'u2', status: 'PENDING' as const },
    { ...base, id: 'c', userId: 'u3', status: 'APPROVED' as const },
  ] as never[];
  assert.deepEqual(leaveApprovalQueue(leaves, { id: 'om', firmRole: 'OFFICE_MANAGER' }).map((l: { id: string }) => l.id), ['b']);
  assert.deepEqual(leaveApprovalQueue(leaves, { id: 'om', firmRole: 'OWNER' }).map((l: { id: string }) => l.id), ['a', 'b']);
});

test('leaveDayEvents expands a leave into one entry per day', () => {
  const leave = { id: 'l1', userId: 'u1', type: 'VACATION' as const, status: 'APPROVED' as const, startDate: '2026-11-29T00:00:00.000Z', endDate: '2026-12-01T00:00:00.000Z', user: { firstName: 'Nat', lastName: 'S' } };
  const days = leaveDayEvents([leave]);
  assert.deepEqual(days.map((d) => d.startAt.slice(0, 10)), ['2026-11-29', '2026-11-30', '2026-12-01']);
  assert.equal(days[0].title, 'ลาพักร้อน · Nat S');
  assert.equal(days[0].leavePending, undefined);
});

test('leaveDayEvents shows pending only when asked, and never rejected', () => {
  const pending = { id: 'l2', userId: 'u2', type: 'PERSONAL' as const, status: 'PENDING' as const, startDate: '2026-11-25', endDate: '2026-11-25', user: { firstName: 'Piya', lastName: 'K' } };
  const rejected = { ...pending, id: 'l3', status: 'REJECTED' as const };
  assert.equal(leaveDayEvents([pending, rejected]).length, 0);
  const shown = leaveDayEvents([pending, rejected], { includePending: true });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].leavePending, true);
});

test('leaveDecisionText names the approver or rejecter, and marks self-approved leave', () => {
  const decidedBy = { firstName: 'สมชาย', lastName: 'ใจดี' };
  assert.equal(leaveDecisionText({ status: 'APPROVED', decidedAt: '2026-10-01T03:00:00Z', decidedBy }), 'อนุมัติโดย สมชาย ใจดี');
  assert.equal(leaveDecisionText({ status: 'REJECTED', decidedAt: '2026-10-01T03:00:00Z', decidedBy }), 'ปฏิเสธโดย สมชาย ใจดี');
  assert.equal(leaveDecisionText({ status: 'APPROVED', decidedAt: null, decidedBy: null }), 'อนุมัติอัตโนมัติ');
  assert.equal(leaveDecisionText({ status: 'APPROVED', decidedAt: '2026-10-01T03:00:00Z', decidedBy: null }), null);
  assert.equal(leaveDecisionText({ status: 'PENDING', decidedAt: null, decidedBy: null }), null);
});

test('leaveSummaryByPerson counts approved days by type, clips to the year, and counts pending requests', () => {
  const user = { firstName: 'Ann', lastName: 'A' };
  const rows = leaveSummaryByPerson([
    { userId: 'a', user, status: 'APPROVED', type: 'SICK', startDate: '2026-03-02', endDate: '2026-03-04' },
    { userId: 'a', user, status: 'APPROVED', type: 'VACATION', startDate: '2025-12-30', endDate: '2026-01-02' },
    { userId: 'a', user, status: 'PENDING', type: 'PERSONAL', startDate: '2026-05-01', endDate: '2026-05-01' },
    { userId: 'a', user, status: 'REJECTED', type: 'PERSONAL', startDate: '2026-06-01', endDate: '2026-06-05' },
    { userId: 'a', user, status: 'APPROVED', type: 'PERSONAL', startDate: '2027-01-04', endDate: '2027-01-04' },
  ], 2026, [{ id: 'b', firstName: 'Ben', lastName: 'B' }]);
  assert.deepEqual(rows, [
    { userId: 'a', name: 'Ann A', SICK: 3, PERSONAL: 0, VACATION: 2, total: 5, pending: 1 },
    { userId: 'b', name: 'Ben B', SICK: 0, PERSONAL: 0, VACATION: 0, total: 0, pending: 0 },
  ]);
});
