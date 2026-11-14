import { ExpenseStatus, FirmRole, SubscriptionPlan, PLAN_CONFIG } from '@lawfirm/shared';
import type { ImportDb, ImportKindDeps } from '../import-kind';
import { staffCases } from '../kind-helpers';
import { casesKind, CaseDraft } from './cases.kind';
import { clientsKind, resolveClientRows } from './clients.kind';
import { eventsKind, resolveEventRows } from './events.kind';
import { expensesKind, resolveExpenseRows } from './expenses.kind';
import { membersKind, resolveMemberRows } from './members.kind';
import { tasksKind, resolveTaskRows } from './tasks.kind';
import { timeEntriesKind, resolveTimeEntryRows } from './time-entries.kind';
import { emptyDeps, importUser, row, staffLookups } from './import-kind.fixtures';

const dbAs = (value: unknown) => value as ImportDb;
const depsAs = (value: unknown) => value as ImportKindDeps;
describe('kind transaction writes and tenant scopes', () => {
  it('loads staff and accessible cases from supplied db with explicit firm and ACL filters', async () => {
    const db = { firmMember: { findMany: jest.fn().mockResolvedValue([]) }, case: { findMany: jest.fn().mockResolvedValue([]) } };
    const filter = { leadLawyerId: importUser.id };
    const deps = depsAs({ caseAccess: { getCaseFilterForUser: jest.fn().mockReturnValue(filter) } });
    await staffCases(dbAs(db), importUser, deps);
    expect(db.firmMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: importUser.firmId, role: { not: FirmRole.EXTERNAL } } }));
    expect(db.case.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ firmId: importUser.firmId, deletedAt: null }, filter] } }));
  });
  it('uses the shared legacy task tenant scope and actual caller access rather than only firmId', async () => {
    const access = { assigneeId: importUser.id };
    const db = { firmMember: { findMany: jest.fn().mockResolvedValue([]) }, case: { findMany: jest.fn().mockResolvedValue([]) }, task: { findMany: jest.fn().mockResolvedValue([]) } };
    const deps = depsAs({ caseAccess: { getCaseFilterForUser: () => ({}), getTaskAccessFilterForUser: jest.fn().mockReturnValue(access) } });
    await tasksKind(deps).lookups(dbAs(db), importUser);
    expect(db.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: [expect.objectContaining({ OR: expect.arrayContaining([expect.objectContaining({ firmId: null })]) }), access] }) }));
  });
  it('limits financial duplicate reads to permitted workers and the accessible firm cases', async () => {
    const db = { firmMember: { findMany: jest.fn().mockResolvedValue([]) }, case: { findMany: jest.fn().mockResolvedValue([]) }, expense: { findMany: jest.fn().mockResolvedValue([]) }, timeEntry: { findMany: jest.fn().mockResolvedValue([]) } };
    const deps = depsAs({ caseAccess: { getCaseFilterForUser: () => ({ id: 'accessible-only' }) } });
    const user = { ...importUser, firmRole: FirmRole.LAWYER };
    await expensesKind(deps).lookups(dbAs(db), user);
    await timeEntriesKind(deps).lookups(dbAs(db), user);
    expect(db.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: { in: [user.id] }, OR: expect.arrayContaining([expect.objectContaining({ case: { firmId: user.firmId } }), { caseId: null, user: { firmMembers: { some: { firmId: user.firmId }, every: { firmId: user.firmId } } } }]) }) }));
    expect(db.timeEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: { in: [user.id] }, case: { firmId: user.firmId } }) }));
  });
  it('writes client/contact through tx with portal disabled', async () => {
    const tx = { client: { create: jest.fn() } };
    await clientsKind(emptyDeps).commit(dbAs(tx), importUser, resolveClientRows([row({ 'ชื่อลูกความ *': 'ลูกความใหม่' })], { existing: new Set() }, importUser));
    expect(tx.client.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firmId: importUser.firmId, contacts: { create: [expect.objectContaining({ name: 'ลูกความใหม่', isPrimary: true, portalEnabled: false })] } }) });
  });
  it('writes task completion import time without invoking normal task side effects', async () => {
    const tx = { task: { create: jest.fn() } };
    await tasksKind(emptyDeps).commit(dbAs(tx), importUser, resolveTaskRows([row({ 'ชื่องาน *': 'ตรวจเอกสาร', สถานะ: 'เสร็จแล้ว' })], staffLookups(), importUser));
    expect(tx.task.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firmId: importUser.firmId, source: 'WEB', createdById: importUser.id, completedAt: expect.any(Date) }) });
  });
  it('maps PAID expense day/importer and time member rate into transaction writes', async () => {
    const tx = { expense: { create: jest.fn() }, timeEntry: { create: jest.fn() } };
    const expense = resolveExpenseRows([row({ 'วันที่ *': '01/01/2569', 'รายการ *': 'ค่าธรรมเนียม', 'จำนวนเงิน (บาท) *': '100', สถานะ: 'จ่ายแล้ว' })], staffLookups(), importUser);
    await expensesKind(emptyDeps).commit(dbAs(tx), importUser, expense);
    expect(tx.expense.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: ExpenseStatus.PAID, paidAt: new Date('2026-01-01T00:00:00Z'), paidById: importUser.id }) });
    await timeEntriesKind(emptyDeps).commit(dbAs(tx), importUser, resolveTimeEntryRows([row({ 'วันที่ *': '01/01/2569', 'เลขอ้างอิงคดี *': 'REF001', 'ชั่วโมง *': '0.001' })], staffLookups(), importUser));
    expect(tx.timeEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({ caseId: 'case-a', userId: importUser.id, hours: 0.001, rate: 2500 }) });
  });
  it('defers only future Outlook schedules until after commit and continues if a schedule throws', async () => {
    const createInternal = jest.fn().mockResolvedValueOnce({ id: 'past', startAt: new Date('2000-01-01') }).mockResolvedValueOnce({ id: 'future1', startAt: new Date('2100-01-01') }).mockResolvedValueOnce({ id: 'future2', startAt: new Date('2100-01-01') });
    const syncEventSoon = jest.fn().mockImplementationOnce(() => { throw new Error('outlook failure'); });
    const deps = depsAs({ calendar: { createInternal }, outlookCalendar: { syncEventSoon } });
    const tx = dbAs({});
    const draft = resolveEventRows([row({ 'เลขอ้างอิงคดี *': 'REF001', 'หัวข้อ *': 'นัด', 'ประเภท *': 'อื่น ๆ', 'วันที่ *': '01/01/2569' })], staffLookups(), importUser)[0];
    const result = await eventsKind(deps).commit(tx, importUser, [draft, draft, draft]);
    expect(createInternal).toHaveBeenCalledWith(draft.data, undefined, tx);
    expect(syncEventSoon).not.toHaveBeenCalled();
    await expect(result.after!()).rejects.toThrow('1 นัดหมาย');
    expect(syncEventSoon.mock.calls).toEqual([['future1'], ['future2']]);
  });
  it('checks the aggregate case quota (closed cases included) before the first case write', async () => {
    const createForImport = jest.fn();
    const deps = depsAs({ cases: { createForImport } });
    const plan = Object.values(SubscriptionPlan).find((value) => PLAN_CONFIG[value].maxCases != null)!;
    const tx = { firm: { findUnique: jest.fn().mockResolvedValue({ subscriptionPlan: plan }) }, case: { count: jest.fn().mockResolvedValue(PLAN_CONFIG[plan].maxCases) } };
    const draft = { title: 'คดี', leadLawyerId: 'lawyer', buddyIds: [], opponents: [], closed: false } as unknown as CaseDraft;
    await expect(casesKind(deps).commit(dbAs(tx), importUser, [draft])).rejects.toThrow('จำนวนคดี');
    expect(createForImport).not.toHaveBeenCalled();
    tx.case.count.mockResolvedValue(0);
    await casesKind(deps).commit(dbAs(tx), importUser, [draft]);
    expect(createForImport).toHaveBeenCalledWith(tx, importUser, expect.objectContaining({ title: 'คดี', closed: null }));
    tx.firm.findUnique.mockClear(); createForImport.mockClear();
    tx.case.count.mockResolvedValue(PLAN_CONFIG[plan].maxCases);
    await expect(casesKind(deps).commit(dbAs(tx), importUser, [{ ...draft, closed: true, outcome: 'WON', closingSummary: 'สรุปคดีที่ปิดแล้ว', closedAt: '2026-01-01' } as CaseDraft])).rejects.toThrow('จำนวนคดี');
    expect(tx.firm.findUnique).toHaveBeenCalledTimes(1);
    expect(createForImport).not.toHaveBeenCalled();
  });
  it('checks all seat reservations before any invitation write and shares invitation sending afterward', async () => {
    const createForImport = jest.fn().mockImplementation(async (_tx, _user, email) => ({ id: email, email }));
    const sendInvitation = jest.fn();
    const assertCanInvite = jest.fn().mockResolvedValue({ allowed: true });
    const deps = depsAs({ tenant: { assertCanInvite }, invitations: { createForImport, sendInvitation } });
    const tx = { firm: { findUnique: jest.fn().mockResolvedValue({ maxUsers: 3 }) }, firmMember: { count: jest.fn().mockResolvedValue(1) }, invitation: { count: jest.fn().mockResolvedValue(1) } };
    const drafts = resolveMemberRows([row({ 'อีเมล *': 'a@example.com', 'ตำแหน่ง *': 'ผู้ช่วย' }), row({ 'อีเมล *': 'b@example.com', 'ตำแหน่ง *': 'ผู้ช่วย' }, 3)], { members: [], memberEmails: new Set(), pendingEmails: new Set() }, importUser);
    await expect(membersKind(deps).commit(dbAs(tx), importUser, drafts)).rejects.toThrow('โควตา');
    expect(assertCanInvite).toHaveBeenCalledTimes(1);
    expect(createForImport).not.toHaveBeenCalled();
    tx.firm.findUnique.mockResolvedValue({ maxUsers: 4 });
    const result = await membersKind(deps).commit(dbAs(tx), importUser, drafts);
    expect(createForImport).toHaveBeenCalledTimes(2);
    expect(createForImport).toHaveBeenCalledWith(tx, importUser, 'a@example.com', FirmRole.ASSISTANT);
    expect(sendInvitation).not.toHaveBeenCalled();
    await result.after!(); expect(sendInvitation).toHaveBeenCalledTimes(2);
  });
  it('refuses invitation tenant denial or a missing firm without writing', async () => {
    const createForImport = jest.fn(); const assertCanInvite = jest.fn().mockResolvedValue({ allowed: false, message: 'no seats' });
    const deps = depsAs({ tenant: { assertCanInvite }, invitations: { createForImport } });
    const drafts = resolveMemberRows([row({ 'อีเมล *': 'a@example.com', 'ตำแหน่ง *': 'ผู้ช่วย' })], { members: [], memberEmails: new Set(), pendingEmails: new Set() }, importUser);
    await expect(membersKind(deps).commit(dbAs({}), importUser, drafts)).rejects.toThrow('no seats');
    assertCanInvite.mockResolvedValue({ allowed: true } as never);
    await expect(membersKind(deps).commit(dbAs({ firm: { findUnique: async () => null }, firmMember: { count: async () => 0 }, invitation: { count: async () => 0 } }), importUser, drafts)).rejects.toThrow('ไม่พบสำนักงาน');
    expect(createForImport).not.toHaveBeenCalled();
    await expect(membersKind(deps).commit(dbAs({}), importUser, [])).resolves.toEqual({ created: 0 });
  });
});
