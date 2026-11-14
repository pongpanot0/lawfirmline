import { AuthUser, FirmRole, Role } from '@lawfirm/shared';
import { isEmail } from 'class-validator';
import { CASE_IMPORT_HEADERS, HEADER_HELP, REQUIRED_HEADERS, COURT_LEVEL_BY_LABEL, OUTCOME_BY_LABEL, PARTY_ROLE_BY_LABEL, STAGE_BY_LABEL } from '../../case-import/case-import-columns';
import { resolveCaseRows, ExcelCaseDraft, ImportLookups } from '../../case-import/case-import-resolve';
import { caseImportTemplateSpec } from '../../case-import/case-import-template';
import { splitList } from '../../common/excel-import/reader';
import type { RawImportRow } from '../../common/excel-import/types';
import { assertCanOpenCases } from '../../common/plan-limits';
import { bangkokDayKey } from '../../common/utils/bangkok-time';
import type { ImportDraft, ImportKindDef, ImportKindDeps } from '../import-kind';
import { checkDuplicate, draftFor, lawyerCanImport, maxLength, memberHelp, ownValue, signature, staffMembers, ImportMember } from '../kind-helpers';

export interface CaseLookups extends ImportLookups { members: ImportMember[]; lawyers: { id: string; name: string; email: string }[]; types: { id: string; name: string }[]; clients: { id: string; name: string }[]; existingNatural: Set<string>; today: Date }
export interface CaseDraft extends ExcelCaseDraft, ImportDraft {}
const lower = (value: string) => value.trim().toLowerCase();
/** Cases without either supplied identifier use title, lead, court level/name and client identity. */
export const caseNaturalSignature = (row: { title: string; leadLawyerId: string; courtLevel: string | null; courtName?: string | null; clientId?: string | null; clientName?: string | null }) => signature(row.title, row.leadLawyerId, row.courtLevel, row.courtName, row.clientId || row.clientName);
export function resolveImportCaseRows(rows: RawImportRow[], lookups: CaseLookups, user: AuthUser): CaseDraft[] {
  const today = lookups.today;
  const seenNatural = new Map<string, number>();
  const seenNoKey = new Set<string>();
  return resolveCaseRows(rows, lookups, today).map((resolved, index) => {
    const base = draftFor(rows[index], user, lawyerCanImport(user));
    const draft: CaseDraft = { ...resolved, cells: base.cells, problems: [...base.problems, ...resolved.problems], refs: { userIds: [resolved.leadLawyerId, ...resolved.buddyIds], clientIds: [resolved.clientId], caseTypeIds: [resolved.caseTypeId] } };
    for (const [header, limit] of [['ชื่อคดี *', 300], ['เลขอ้างอิงภายใน', 50], ['เลขอ้างอิงลูกค้า', 100], ['ลูกความ', 300], ['ศาล', 200], ['สรุปตอนปิด', 2000], ['รายละเอียด', 5000]] as const) maxLength(draft, header, limit);
    for (const [header, labels] of [['ชั้นศาล *', COURT_LEVEL_BY_LABEL], ['ฐานะลูกความ', PARTY_ROLE_BY_LABEL], ['ขั้นตอนคดี', STAGE_BY_LABEL], ['ผลคดี', OUTCOME_BY_LABEL]] as const) {
      const value = draft.cells[header];
      if (value && !ownValue<string>(labels, value) && !draft.problems.some((problem) => problem.includes(header.replace(' *', '')))) draft.problems.push(`${header}: ไม่ถูกต้อง ${value}`);
    }
    const lead = draft.cells['ทนายหลัก (อีเมล) *'];
    if (lead && !isEmail(lead)) draft.problems.push(`ทนายหลัก (อีเมล) *: อีเมลไม่ถูกต้อง ${lead}`);
    const emails = splitList(rows[index].values['ทีม (อีเมล คั่นด้วย ;)']);
    for (const email of emails) if (!isEmail(email)) draft.problems.push(`ทีม (อีเมล คั่นด้วย ;): อีเมลไม่ถูกต้อง ${email}`);
    if (new Set(emails.map(lower)).size !== emails.length) draft.problems.push('ทีม (อีเมล คั่นด้วย ;): มีอีเมลซ้ำในทีม');
    if (draft.buddyIds.length > 20) draft.problems.push('ทีม (อีเมล คั่นด้วย ;): สมาชิกทีมเกิน 20 คน');
    if (draft.opponents.length > 30) draft.problems.push('คู่ความฝ่ายตรงข้าม (คั่นด้วย ;): คู่ความเกิน 30 คน');
    for (const opponent of draft.opponents) if (opponent.length > 200) draft.problems.push(`คู่ความฝ่ายตรงข้าม (คั่นด้วย ;): ${opponent} ยาวเกิน 200 ตัวอักษร`);
    const lawyer = lookups.lawyers.find((item) => item.id === draft.leadLawyerId);
    if (lawyer) draft.cells['ทนายหลัก (อีเมล) *'] = `${lawyer.name} <${lawyer.email}>`;
    draft.cells['ทีม (อีเมล คั่นด้วย ;)'] = draft.buddyIds.map((id) => { const member = lookups.members.find((item) => item.id === id); return member ? `${member.name} <${member.email}>` : id; }).join('; ');
    if (draft.clientId) draft.cells['ลูกความ'] = lookups.clients.find((client) => client.id === draft.clientId)?.name ?? draft.clientName ?? '';
    if (draft.title) {
      const key = caseNaturalSignature(draft);
      const noKey = !draft.ownRef && !draft.blackCaseNumber;
      if (noKey || seenNoKey.has(key)) checkDuplicate(draft, key, noKey ? lookups.existingNatural : new Set(), seenNatural, 'ชื่อคดี *');
      seenNatural.set(key, draft.rowNumber);
      if (noKey) seenNoKey.add(key);
    }
    return draft;
  });
}
export function casesKind(deps: ImportKindDeps): ImportKindDef<CaseDraft, CaseLookups> {
  return {
    kind: 'cases', label: 'คดี', sheet: 'คดี', headers: CASE_IMPORT_HEADERS, required: REQUIRED_HEADERS, help: HEADER_HELP, canImport: lawyerCanImport,
    template: (lookups) => { const extras = caseImportTemplateSpec({ caseTypes: lookups.types.map((type) => type.name), lawyers: lookups.lawyers }); return { ...extras, extraHelp: [...(extras.extraHelp ?? []), ...memberHelp(lookups.members)] }; },
    async lookups(db, user) {
      const [lawyers, members, clients, types, cases, proceedings, visible] = await Promise.all([
        db.user.findMany({ where: { role: { in: [Role.ADMIN, Role.LAWYER] }, firmMembers: { some: { firmId: user.firmId, role: { not: FirmRole.EXTERNAL } } } }, select: { id: true, email: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
        staffMembers(db, user),
        db.client.findMany({ where: { firmId: user.firmId }, select: { id: true, name: true } }),
        db.caseType.findMany({ where: { firmId: user.firmId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        db.case.findMany({ where: { firmId: user.firmId }, select: { ownRef: true, blackCaseNumber: true, courtName: true, deletedAt: true, title: true, leadLawyerId: true, courtLevel: true, clientId: true, clientName: true } }),
        db.caseProceeding.findMany({ where: { case: { firmId: user.firmId, deletedAt: null }, blackCaseNumber: { not: null } }, select: { blackCaseNumber: true, courtName: true, case: { select: { ownRef: true } } } }),
        db.case.findMany({ where: deps.caseAccess.getCaseFilterForUser(user), select: { ownRef: true } }),
      ]);
      return {
        today: new Date(`${bangkokDayKey(new Date())}T00:00:00Z`),
        members, lawyers: lawyers.map((lawyer) => ({ id: lawyer.id, name: `${lawyer.firstName} ${lawyer.lastName}`.trim(), email: lawyer.email })), clients, types,
        lawyersByEmail: new Map(lawyers.map((lawyer) => [lower(lawyer.email), lawyer.id])), membersByEmail: new Map(members.map((member) => [lower(member.email), member.id])),
        clientsByName: new Map(clients.map((client) => [lower(client.name), client.id])), caseTypesByName: new Map(types.map((type) => [lower(type.name), type.id])),
        existingOwnRefs: new Set(cases.map((item) => item.ownRef)), visibleOwnRefs: new Set(visible.map((item) => item.ownRef)),
        existingNumbers: [...cases.filter((item) => !item.deletedAt && item.blackCaseNumber).map((item) => ({ number: item.blackCaseNumber!, court: item.courtName, ownRef: item.ownRef })), ...proceedings.map((item) => ({ number: item.blackCaseNumber!, court: item.courtName, ownRef: item.case.ownRef }))],
        existingNatural: new Set(cases.filter((item) => !item.deletedAt).map(caseNaturalSignature)),
      };
    },
    resolve: resolveImportCaseRows,
    async commit(tx, user, drafts) {
      const openCount = drafts.filter((draft) => !draft.closed).length;
      if (openCount) await assertCanOpenCases(tx, user.firmId, openCount);
      const day = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : undefined;
      for (const row of drafts) await deps.cases.createForImport(tx, user, {
        title: row.title, leadLawyerId: row.leadLawyerId, buddyIds: row.buddyIds, courtLevel: row.courtLevel,
        courtName: row.courtName || null, blackCaseNumber: row.blackCaseNumber || null, redCaseNumber: row.redCaseNumber || undefined,
        ownRef: row.ownRef || undefined, customerRef: row.customerRef || undefined, clientId: row.clientId, clientName: row.clientName || undefined,
        partyRole: row.partyRole, opponents: row.opponents, caseTypeId: row.caseTypeId, claimedAmount: row.claimedAmount, estimatedFee: row.estimatedFee,
        limitationDeadline: day(row.limitationDeadline), description: row.description || undefined, stage: row.closed ? undefined : row.stage, openedAt: day(row.openedAt),
        closed: row.closed ? { outcome: row.outcome!, closingSummary: row.closingSummary!.trim(), closedAt: day(row.closedAt) } : null,
      });
      return { created: drafts.length };
    },
  };
}
