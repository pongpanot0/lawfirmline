import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { suggestMember } from './team-radar-helpers.ts';

test('suggests the lightest member without overdue work or leave today', () => {
  const members = [
    { userId: 'late', overdueCount: 1, openPoints: 0 },
    { userId: 'leave', overdueCount: 0, openPoints: 1 },
    { userId: 'available', overdueCount: 0, openPoints: 2 },
    { userId: 'busy', overdueCount: 0, openPoints: 4 },
    { userId: 'unknown', overdueCount: 0, openPoints: 0 },
  ];
  const today = members.filter((m) => m.userId !== 'unknown').map((m) => ({ userId: m.userId, onLeave: m.userId === 'leave' }));
  assert.equal(suggestMember(members, today)?.userId, 'available');
  assert.equal(suggestMember(members, []), undefined);
});
