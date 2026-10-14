import { connectionHealth, humanizeGraphError, HealthInput } from './connection-health';

const now = new Date('2026-10-14T12:00:00Z');
const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
const base: HealthInput = {
  status: 'ACTIVE',
  syncInboxToIntake: true,
  lastSyncedAt: ago(0.5),
  subscriptionExpiresAt: new Date(now.getTime() + 3600_000),
  lastError: null,
  updatedAt: ago(100),
  failingFolderLinks: 0,
};

describe('connectionHealth', () => {
  it('OK when nothing is wrong', () => expect(connectionHealth(base, now)).toEqual({ health: 'OK', reason: null }));
  it.each(['EXPIRED', 'ERROR', 'REVOKED'])('BROKEN for %s', (status) => {
    expect(connectionHealth({ ...base, status }, now).health).toBe('BROKEN');
  });
  it('REVOKED has its own reason', () => expect(connectionHealth({ ...base, status: 'REVOKED' }, now).reason).toBe('ตัดการเชื่อมต่อแล้ว'));
  it('WARN on failing folder link', () => expect(connectionHealth({ ...base, failingFolderLinks: 2 }, now).health).toBe('WARN'));
  it('WARN when never synced or older than 2h, only if inbox sync is on', () => {
    expect(connectionHealth({ ...base, lastSyncedAt: null }, now).health).toBe('WARN');
    expect(connectionHealth({ ...base, lastSyncedAt: ago(3) }, now).health).toBe('WARN');
    expect(connectionHealth({ ...base, lastSyncedAt: ago(3), syncInboxToIntake: false }, now).health).toBe('OK');
  });
  it('WARN on expired subscription', () => {
    expect(connectionHealth({ ...base, subscriptionExpiresAt: ago(1) }, now).health).toBe('WARN');
  });
  it('WARN on a recent error only', () => {
    expect(connectionHealth({ ...base, lastError: 'x', updatedAt: ago(1) }, now).health).toBe('WARN');
    expect(connectionHealth({ ...base, lastError: 'x', updatedAt: ago(30) }, now).health).toBe('OK');
  });
});

describe('humanizeGraphError', () => {
  it.each([
    [null, null],
    ['Token refresh failed: invalid_grant', 'สิทธิ์หมดอายุ ต้องเชื่อมต่อใหม่'],
    ['Graph 403 Forbidden', 'ไม่มีสิทธิ์เข้าถึง (ผู้ดูแล Microsoft ขององค์กรอาจยังไม่อนุมัติสิทธิ์)'],
    ['ErrorItemNotFound', 'ไม่พบ folder/ไฟล์ใน Microsoft แล้ว (อาจถูกลบหรือย้าย) — ผูกใหม่'],
    ['429 Too many', 'Microsoft จำกัดการเรียกชั่วคราว ระบบจะลองใหม่เอง'],
    ['Graph 503', 'เชื่อมต่อ Microsoft ไม่ได้ชั่วคราว ระบบจะลองใหม่เอง'],
    ['fetch failed', 'เชื่อมต่อ Microsoft ไม่ได้ชั่วคราว ระบบจะลองใหม่เอง'],
    ['Subscription follow-up failed', 'การแจ้งเตือนอีเมลใหม่จาก Microsoft มีปัญหา — ระบบยังดึงอีเมลตามรอบได้'],
    ['weird', 'เกิดข้อผิดพลาด: weird'],
  ])('%s', (raw, out) => expect(humanizeGraphError(raw)).toBe(out));
  it('truncates unknown text to 120 chars', () => {
    expect(humanizeGraphError('z'.repeat(500))).toBe(`เกิดข้อผิดพลาด: ${'z'.repeat(120)}`);
  });
});
