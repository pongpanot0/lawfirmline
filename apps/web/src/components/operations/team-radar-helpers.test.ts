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

test('avatar color is stable and check-in states have clear labels', async () => {
  const { avatarColor, standupLabel } = await import('./team-radar-helpers.ts');
  assert.equal(avatarColor('person-1'), avatarColor('person-1'));
  assert.equal(standupLabel('blocked'), 'ติดปัญหา');
  assert.equal(standupLabel('not_yet'), 'ยังไม่เช็กอิน');
  assert.equal(standupLabel('not_required'), 'ไม่ต้องเช็กอิน');
});

test('labels every check-in state', async () => {
  const { standupLabel } = await import('./team-radar-helpers.ts');
  assert.deepEqual(['checked_in', 'not_yet', 'skipped', 'blocked', 'on_leave', 'not_required'].map(standupLabel),
    ['เช็กอินแล้ว', 'ยังไม่เช็กอิน', 'ข้ามวันนี้', 'ติดปัญหา', 'ลาวันนี้', 'ไม่ต้องเช็กอิน']);
});
