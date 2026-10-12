/** Mirrors the API's ConflictMatch. */
export interface ConflictMatchItem {
  kind: string;
  term: string;
  name: string;
  side?: string;
  role?: string;
  caseId?: string;
  caseTitle?: string;
  ownRef?: string;
  intakeId?: string;
  intakeTitle?: string;
}

export const OVERRIDE_MIN_LENGTH = 10;

/**
 * The matches of a 409 CONFLICT_FOUND, or null for any other error. Checked by shape
 * (ApiError's `status` + `body`) so this file stays importable without api.ts.
 */
export function conflictMatchesFrom(err: unknown): ConflictMatchItem[] | null {
  const e = err as { status?: number; body?: unknown } | null;
  if (!e || typeof e !== 'object' || e.status !== 409) return null;
  const body = e.body as { code?: string; matches?: ConflictMatchItem[] } | undefined;
  return body?.code === 'CONFLICT_FOUND' && Array.isArray(body.matches) ? body.matches : null;
}

export function describeConflictMatch(m: ConflictMatchItem): string {
  const side = m.side === 'OURS' ? 'ฝ่ายเรา' : m.side === 'OPPONENT' ? 'ฝ่ายตรงข้าม' : 'ผู้เกี่ยวข้อง';
  if (m.kind === 'CLIENT' || m.kind === 'CLIENT_CONTACT') return `${m.name} — ลูกความของสำนักงาน`;
  if (m.kind === 'INTAKE_PARTY' || m.intakeId) return `${m.name} — ${side}ในเรื่องรับใหม่ ${m.intakeTitle ?? ''}`.trim();
  return `${m.name} — ${side}ในคดี ${[m.ownRef, m.caseTitle].filter(Boolean).join(' ')}`.trim();
}
