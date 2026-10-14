export type ConnectionHealth = 'OK' | 'WARN' | 'BROKEN';

export interface HealthInput {
  status: string;
  syncInboxToIntake: boolean;
  lastSyncedAt: Date | null;
  subscriptionExpiresAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
  failingFolderLinks: number;
}

const HOUR = 60 * 60 * 1000;

/** Traffic light for one Microsoft connection; the reason is the first matching rule, in Thai. */
export function connectionHealth(conn: HealthInput, now: Date): { health: ConnectionHealth; reason: string | null } {
  if (conn.status === 'REVOKED') return { health: 'BROKEN', reason: 'ตัดการเชื่อมต่อแล้ว' };
  if (conn.status !== 'ACTIVE') return { health: 'BROKEN', reason: 'สิทธิ์หมดอายุหรือถูกยกเลิก — เจ้าของบัญชีต้องเชื่อมต่อใหม่' };
  const t = now.getTime();
  if (conn.failingFolderLinks > 0) return { health: 'WARN', reason: `folder ที่ผูกกับคดีผิดพลาด ${conn.failingFolderLinks} รายการ` };
  if (conn.syncInboxToIntake && (!conn.lastSyncedAt || t - conn.lastSyncedAt.getTime() > 2 * HOUR)) {
    return { health: 'WARN', reason: 'ยังไม่ได้ซิงก์อีเมลมานานกว่า 2 ชั่วโมง' };
  }
  if (conn.syncInboxToIntake && conn.subscriptionExpiresAt && conn.subscriptionExpiresAt.getTime() < t) {
    return { health: 'WARN', reason: 'การแจ้งเตือนอีเมลใหม่จาก Microsoft หมดอายุ' };
  }
  if (conn.lastError && t - conn.updatedAt.getTime() < 24 * HOUR) return { health: 'WARN', reason: 'มีข้อผิดพลาดล่าสุดภายใน 24 ชั่วโมง' };
  return { health: 'OK', reason: null };
}

/** Maps a raw Graph/sync error text to plain Thai. First matching rule wins. */
export function humanizeGraphError(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => s.includes(n));
  if (has('token refresh failed', 'invalid_grant', '401')) return 'สิทธิ์หมดอายุ ต้องเชื่อมต่อใหม่';
  if (has('403', 'forbidden', 'accessdenied')) return 'ไม่มีสิทธิ์เข้าถึง (ผู้ดูแล Microsoft ขององค์กรอาจยังไม่อนุมัติสิทธิ์)';
  if (has('404', 'erroritemnotfound', 'not found')) return 'ไม่พบ folder/ไฟล์ใน Microsoft แล้ว (อาจถูกลบหรือย้าย) — ผูกใหม่';
  if (has('429', 'throttl')) return 'Microsoft จำกัดการเรียกชั่วคราว ระบบจะลองใหม่เอง';
  if (/\b5\d\d\b/.test(s) || has('timeout', 'econn', 'fetch failed')) return 'เชื่อมต่อ Microsoft ไม่ได้ชั่วคราว ระบบจะลองใหม่เอง';
  if (has('subscription')) return 'การแจ้งเตือนอีเมลใหม่จาก Microsoft มีปัญหา — ระบบยังดึงอีเมลตามรอบได้';
  return `เกิดข้อผิดพลาด: ${raw.slice(0, 120)}`;
}
