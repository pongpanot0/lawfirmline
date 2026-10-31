import { bangkokDayKey } from '../common/utils/bangkok-time';
import type { TimeSuggestion } from './time-suggestions.service';

/**
 * 6 นาทีต่ออีเมล ปัดขึ้นเป็นช่วง 0.25 ชม. (1–2 ฉบับ = 0.25, 3–5 = 0.5, 6–7 = 0.75).
 * = ceil(count × 0.1 / 0.25) × 0.25 คิดเป็นจำนวนเต็ม เพราะ 15 × 0.1 เป็น 1.5000000000000002 ใน float
 */
export function emailSuggestionHours(count: number): number {
  return Math.ceil((count * 2) / 5) / 4;
}

export type SentEmailRow = {
  messageKey: string;
  fromAddress: string | null;
  receivedAt: Date;
  thread: { caseId: string | null; case: { ownRef: string | null } | null };
};

/**
 * One suggestion per case for the Bangkok day `date`, counting only mail the user
 * sent: `fromAddress` must be one of the user's own mailbox addresses. Attribution is
 * by sender alone — stored direction and the thread's mailbox owner are irrelevant
 * (a shared row first synced by a CC'd colleague is stored INBOUND). Each message
 * counts once per case: the same messageKey can sit in two case-linked threads.
 */
export function emailTimeSuggestions(
  rows: SentEmailRow[],
  ownAddresses: string[],
  date: string,
): TimeSuggestion[] {
  const own = new Set(ownAddresses.map((a) => a.trim().toLowerCase()));
  const byCase = new Map<string, { caseRef: string | null; keys: Set<string> }>();
  for (const row of rows) {
    const caseId = row.thread.caseId;
    if (!caseId) continue;
    if (!row.fromAddress || !own.has(row.fromAddress.trim().toLowerCase())) continue;
    if (bangkokDayKey(row.receivedAt) !== date) continue;
    const entry = byCase.get(caseId);
    if (entry) entry.keys.add(row.messageKey);
    else byCase.set(caseId, { caseRef: row.thread.case?.ownRef ?? null, keys: new Set([row.messageKey]) });
  }
  return [...byCase.entries()].map(([caseId, { caseRef, keys }]) => ({
    sourceKey: `email:${caseId}:${date}`,
    source: 'email',
    caseId,
    caseRef,
    description: `ส่งอีเมลคดี ${keys.size} ฉบับ`,
    hours: emailSuggestionHours(keys.size),
    date,
  }));
}
