import { AuthUser, FirmRole, Role } from '@lawfirm/shared';
import { isEmail } from 'class-validator';
import { parseAmount, parseImportDate } from '../common/excel-import/reader';
import type { RawImportRow, TemplateExtras } from '../common/excel-import/types';
import type { ImportDb, ImportDraft, ImportKindDeps } from './import-kind';

export interface ImportMember {
  id: string;
  email: string;
  name: string;
  role: FirmRole;
  defaultHourlyRate: number | null;
}
export interface ImportCase { id: string; ownRef: string; title: string; leadLawyerId: string; courtName: string | null }
export interface StaffCaseLookups {
  members: ImportMember[];
  cases: ImportCase[];
  existing: Set<string>;
}
export function ownValue<T>(values: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
}
export const normalized = (value: string) => value.normalize('NFKC').trim().toLowerCase();
export const cellText = (value: unknown): string => value == null ? '' : value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : String(value).trim();
export const staffCanImport = (user: AuthUser) => user.firmRole !== FirmRole.EXTERNAL;
export const lawyerCanImport = (user: AuthUser) => staffCanImport(user) && !!user.role && [Role.ADMIN, Role.LAWYER].includes(user.role);

export function draftFor(row: RawImportRow, user: AuthUser, allowed = staffCanImport(user)): ImportDraft {
  return {
    rowNumber: row.rowNumber,
    problems: allowed ? [] : ['คุณไม่มีสิทธิ์นำเข้าข้อมูลประเภทนี้'],
    cells: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, cellText(value)])),
    refs: {},
  };
}
export function requiredText(draft: ImportDraft, header: string): string {
  const value = draft.cells[header] ?? '';
  if (!value) draft.problems.push(`ยังไม่ได้กรอก ${header}`);
  return value;
}
export function maxLength(draft: ImportDraft, header: string, limit: number): void {
  const value = draft.cells[header] ?? '';
  if (value.length > limit) draft.problems.push(`${header}: ${value} ยาวเกิน ${limit} ตัวอักษร`);
}
export function emailProblem(draft: ImportDraft, header: string, required = false): string {
  const value = draft.cells[header] ?? '';
  if (!value && required) draft.problems.push(`ยังไม่ได้กรอก ${header}`);
  else if (value && !isEmail(value)) draft.problems.push(`${header}: อีเมลไม่ถูกต้อง ${value}`);
  return value.toLowerCase();
}
export function importDate(draft: ImportDraft, row: RawImportRow, header: string, required = false): Date | undefined {
  const parsed = parseImportDate(row.values[header]);
  if (parsed === 'INVALID') draft.problems.push(`${header}: วันที่ไม่ถูกต้อง ${draft.cells[header]}`);
  else if (!parsed && required) draft.problems.push(`ยังไม่ได้กรอก ${header}`);
  return parsed instanceof Date ? parsed : undefined;
}
export function importAmount(draft: ImportDraft, row: RawImportRow, header: string, required = false): number | undefined {
  const parsed = parseAmount(row.values[header]);
  if (parsed === 'INVALID' || (typeof parsed === 'number' && !Number.isFinite(parsed))) draft.problems.push(`${header}: จำนวนเงินไม่ถูกต้อง ${draft.cells[header]}`);
  else if (parsed === null && required) draft.problems.push(`ยังไม่ได้กรอก ${header}`);
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
}
export function yesNo(draft: ImportDraft, header: string): boolean {
  const value = draft.cells[header] ?? '';
  if (value && !['ใช่', 'ไม่'].includes(value)) draft.problems.push(`${header}: ต้องเป็น ใช่ หรือ ไม่ (${value})`);
  return value !== 'ไม่';
}
export function resolveMember(draft: ImportDraft, lookups: Pick<StaffCaseLookups, 'members'>, header: string, fallbackId?: string): ImportMember | undefined {
  const email = emailProblem(draft, header);
  const member = email ? lookups.members.find((item) => item.email.toLowerCase() === email) : lookups.members.find((item) => item.id === fallbackId);
  if ((email || fallbackId) && !member) draft.problems.push(`${header}: ไม่พบสมาชิกอีเมล ${email || fallbackId} ในสำนักงาน`);
  if (member) {
    draft.refs.userIds = [...(draft.refs.userIds ?? []), member.id];
    draft.cells[header] = `${member.name} <${member.email}>`;
  }
  return member;
}
export function resolveCase(draft: ImportDraft, lookups: Pick<StaffCaseLookups, 'cases'>, header: string, required = false): ImportCase | undefined {
  const ref = required ? requiredText(draft, header) : draft.cells[header] ?? '';
  const item = ref ? lookups.cases.find((value) => value.ownRef === ref) : undefined;
  if (ref && !item) draft.problems.push(`ไม่พบคดี ${ref} หรือคุณไม่มีสิทธิ์ในคดีนี้`);
  if (item) draft.cells[header] = `${item.ownRef} — ${item.title}`;
  return item;
}
/** Natural keys are arrays encoded as JSON so delimiters inside user-entered titles cannot collide. */
export const signature = (...values: (string | number | boolean | null | undefined)[]) => JSON.stringify(values.map((value) => typeof value === 'string' ? normalized(value) : value ?? null));
export const dayKey = (date?: Date | null) => date?.toISOString().slice(0, 10);
export function checkDuplicate(draft: ImportDraft, key: string, existing: Set<string>, seen: Map<string, number>, column: string): void {
  if (existing.has(key)) draft.problems.push(`${column}: มีรายการนี้ในระบบแล้ว (${draft.cells[column] ?? ''})`);
  else if (seen.has(key)) draft.problems.push(`${column}: ซ้ำกับแถวที่ ${seen.get(key)} ในไฟล์ (${draft.cells[column] ?? ''})`);
  seen.set(key, draft.rowNumber);
}
export async function staffMembers(db: ImportDb, user: AuthUser): Promise<ImportMember[]> {
  const members = await db.firmMember.findMany({
    where: { firmId: user.firmId, role: { not: FirmRole.EXTERNAL } },
    select: { userId: true, role: true, defaultHourlyRate: true, user: { select: { email: true, firstName: true, lastName: true } } },
  });
  return members.map((member) => ({ id: member.userId, email: member.user.email, name: `${member.user.firstName} ${member.user.lastName}`.trim(), role: member.role as FirmRole, defaultHourlyRate: member.defaultHourlyRate }));
}
export async function staffCases(db: ImportDb, user: AuthUser, deps: ImportKindDeps): Promise<Omit<StaffCaseLookups, 'existing'>> {
  const [members, cases] = await Promise.all([
    staffMembers(db, user),
    db.case.findMany({
      where: { AND: [{ firmId: user.firmId, deletedAt: null }, deps.caseAccess.getCaseFilterForUser(user)] },
      select: { id: true, ownRef: true, title: true, leadLawyerId: true, courtName: true },
    }),
  ]);
  return { members, cases };
}
export const memberHelp = (members: ImportMember[]): NonNullable<TemplateExtras['extraHelp']> => [{ title: 'สมาชิกของสำนักงาน (อีเมล)', rows: members.map((member) => [member.name, member.email]) }];
