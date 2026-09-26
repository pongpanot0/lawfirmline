import { withFirmSlugHeaders } from './firm-slug';
import { actionSuccessMessage, publishActionFeedback } from './action-feedback';
import type { CaseStage } from '@lawfirm/shared';
export interface ImportRow { clientName: string; caseRef: string; caseTitle: string }
export interface ImportPreview { id: string; rows: (ImportRow & { row: number; existingClientId: string | null; errors: string[] })[]; canCommit: boolean }
export interface SetupProgress { members: number; clients: number; cases: number; invites: number; batches: { id: string; status: string; createdAt: string }[] }
export type FirmRoleStr = 'OWNER' | 'SENIOR_LAWYER' | 'LAWYER' | 'ASSISTANT';
export type PlaybookDayBasis = 'CALENDAR' | 'BUSINESS';
export interface PlaybookStep {
  title: string;
  instructions: string;
  primaryRole?: FirmRoleStr;
  secondaryRole?: FirmRoleStr;
  /** ขั้นตอนคดีที่ผูกงานนี้ไว้ — ใช้เสนอสร้างงานตอนย้ายเข้าขั้นนี้ */
  stage?: CaseStage;
  /** จำนวนวันหลังเข้าขั้นตอน ก่อนถึงกำหนดส่งงาน */
  offsetDays?: number;
  dayBasis?: PlaybookDayBasis;
}
export interface CargoPlaybookRequirement { code: string; label: string; requiredByDefault: boolean }
export interface CargoPlaybookTemplate { requirements: CargoPlaybookRequirement[] }
export interface PlaybookRelease { id: string; name: string; caseTypeId: string | null; templateKey?: string | null; cargoTemplate?: CargoPlaybookTemplate | null; version: number; steps: PlaybookStep[] }
export interface PlaybookPreview { release: PlaybookRelease; existing: { id: string } | null; ownerId: string; steps: PlaybookStep[] }
export async function setupRequest<T>(token: string, path: string, body?: object): Promise<T> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/practice-setup${path}`, { method: body ? 'POST' : 'GET', headers: withFirmSlugHeaders({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (!r.ok) { const error = await r.json().catch(() => ({})); const message = Array.isArray(error.message) ? error.message.join(', ') : error.message ?? `Request failed (${r.status})`; if (body) publishActionFeedback('error', `ทำรายการไม่สำเร็จ: ${message}`); throw new Error(message); }
  if (body) publishActionFeedback('success', actionSuccessMessage('POST'));
  return r.json();
}
/** RFC4180-style quoted cells and CRLF; reject incomplete input rather than guessing columns. */
export function parseImportCsv(text: string): ImportRow[] {
  const table: string[][] = []; let row: string[] = [], cell = '', quoted = false, afterQuote = false;
  const raw = text.replace(/^\uFEFF/, '');
  for (let i = 0; i <= raw.length; i++) {
    const c = raw[i];
    if (quoted) { if (c === undefined) throw new Error('Unclosed CSV quote / เครื่องหมายคำพูดไม่ครบ'); if (c === '"') { if (raw[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } } else cell += c; continue; }
    if (c === '"' && !cell && !afterQuote) { quoted = true; continue; }
    if (c === ',' || c === '\n' || c === undefined || c === '\r') { row.push(cell); cell = ''; afterQuote = false; if (c !== ',') { if (row.some(v => v.trim())) table.push(row); row = []; if (c === '\r' && raw[i + 1] === '\n') i++; } }
    else { if (afterQuote) throw new Error('Unexpected text after CSV quote / รูปแบบ CSV ไม่ถูกต้อง'); cell += c; }
  }
  const header = table.shift()?.map(v => v.trim());
  const names = ['clientName', 'caseRef', 'caseTitle'];
  if (!header || header.length !== 3 || names.some(n => !header.includes(n))) throw new Error('CSV columns: clientName,caseRef,caseTitle');
  if (!table.length || table.length > 200) throw new Error('Import 1–200 rows / นำเข้าได้ 1–200 แถว');
  return table.map((cells, i) => { if (cells.length !== 3) throw new Error(`Row ${i + 2}: expected 3 columns / จำนวนคอลัมน์ไม่ครบ`); return Object.fromEntries(names.map(n => [n, cells[header.indexOf(n)]])) as unknown as ImportRow; });
}
