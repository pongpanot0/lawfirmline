import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leaveFlagsForDate, leaveWarning } from './leave-flags.ts';

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
  assert.equal(leaveWarning('สมชาย', '2026-10-03'), '⚠ สมชาย ลาวันที่ 3/10/2569');
});
