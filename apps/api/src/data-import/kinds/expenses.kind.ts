import { AuthUser, EXPENSE_CATEGORIES, ExpenseStatus, MONEY_MAX, MONEY_MIN, hasFirmCapability } from '@lawfirm/shared';
import type { RawImportRow } from '../../common/excel-import/types';
import type { ImportDraft, ImportKindDef, ImportKindDeps } from '../import-kind';
import { checkDuplicate, dayKey, draftFor, importAmount, importDate, maxLength, memberHelp, requiredText, resolveCase, resolveMember, signature, staffCanImport, staffCases, StaffCaseLookups, yesNo } from '../kind-helpers';

export const EXPENSE_HEADERS = ['วันที่ *', 'รายการ *', 'จำนวนเงิน (บาท) *', 'เลขอ้างอิงคดี', 'หมวด', 'ผู้เบิก (อีเมล; ว่าง = ผู้นำเข้า)', 'เลขที่ใบเสร็จ', 'เรียกเก็บลูกความ', 'สถานะ'] as const;
export interface ExpenseDraft extends ImportDraft { date?: Date; description: string; amount?: number; caseId?: string; category?: string; userId: string; officialReceiptNo?: string; billable: boolean; status: ExpenseStatus }
/** Same expense = day, description, amount, accessible case, claimant and official receipt number. */
export const expenseSignature = (expense: Pick<ExpenseDraft, 'date' | 'description' | 'amount' | 'caseId' | 'userId' | 'officialReceiptNo'>) => signature(dayKey(expense.date), expense.description, expense.amount, expense.caseId, expense.userId, expense.officialReceiptNo);
export function resolveExpenseRows(rows: RawImportRow[], lookups: StaffCaseLookups, user: AuthUser): ExpenseDraft[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const draft = draftFor(row, user);
    const date = importDate(draft, row, EXPENSE_HEADERS[0], true);
    const description = requiredText(draft, EXPENSE_HEADERS[1]);
    const amount = importAmount(draft, row, EXPENSE_HEADERS[2], true);
    if (amount !== undefined && (amount < MONEY_MIN || amount > MONEY_MAX)) draft.problems.push(`${EXPENSE_HEADERS[2]}: ${draft.cells[EXPENSE_HEADERS[2]]} ต้องอยู่ระหว่าง ${MONEY_MIN} ถึง ${MONEY_MAX}`);
    const legalCase = resolveCase(draft, lookups, 'เลขอ้างอิงคดี');
    const member = resolveMember(draft, lookups, EXPENSE_HEADERS[5], user.id);
    if (member && member.id !== user.id && !hasFirmCapability(user.firmRole, 'manageInvoices')) draft.problems.push(`${EXPENSE_HEADERS[5]}: ไม่มีสิทธิ์ระบุผู้เบิกคนอื่น (${member.email})`);
    const category = draft.cells['หมวด'] || undefined;
    if (category && !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) draft.problems.push(`หมวด: ไม่ถูกต้อง ${category}`);
    const statusText = draft.cells['สถานะ'];
    if (statusText && !['ร่าง', 'จ่ายแล้ว'].includes(statusText)) draft.problems.push(`สถานะ: ไม่ถูกต้อง ${statusText}`);
    const status = statusText === 'จ่ายแล้ว' ? ExpenseStatus.PAID : ExpenseStatus.DRAFT;
    if (status === ExpenseStatus.PAID && !hasFirmCapability(user.firmRole, 'manageInvoices')) draft.problems.push(`สถานะ: ไม่มีสิทธิ์นำเข้า จ่ายแล้ว`);
    maxLength(draft, EXPENSE_HEADERS[1], 500); maxLength(draft, 'หมวด', 100); maxLength(draft, 'เลขที่ใบเสร็จ', 100);
    const result: ExpenseDraft = { ...draft, date, description, amount, caseId: legalCase?.id, userId: member?.id ?? '', category, officialReceiptNo: draft.cells['เลขที่ใบเสร็จ'] || undefined, billable: yesNo(draft, 'เรียกเก็บลูกความ'), status };
    if (description && date && amount !== undefined && member) checkDuplicate(result, expenseSignature(result), lookups.existing, seen, EXPENSE_HEADERS[1]);
    return result;
  });
}
export function expensesKind(deps: ImportKindDeps): ImportKindDef<ExpenseDraft, StaffCaseLookups> {
  return {
    kind: 'expenses', label: 'ค่าใช้จ่าย', sheet: 'ค่าใช้จ่าย', headers: EXPENSE_HEADERS, required: [...EXPENSE_HEADERS.slice(0, 3)], canImport: staffCanImport,
    help: {
      'วันที่ *': 'วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.)', 'รายการ *': 'รายการค่าใช้จ่ายไม่เกิน 500 ตัวอักษร', 'จำนวนเงิน (บาท) *': `จำนวนเงิน ${MONEY_MIN}–${MONEY_MAX} บาท ไม่เกิน 2 ตำแหน่งทศนิยม`,
      'เลขอ้างอิงคดี': 'เลขอ้างอิงภายในคดีที่คุณเข้าถึงได้ เว้นว่างได้', 'หมวด': 'เลือกหมวดจากรายการ เว้นว่างได้',
      'ผู้เบิก (อีเมล; ว่าง = ผู้นำเข้า)': 'เว้นว่าง = ผู้นำเข้า ผู้จัดการการเงินระบุสมาชิกคนอื่นได้', 'เลขที่ใบเสร็จ': 'เลขใบเสร็จไม่เกิน 100 ตัวอักษร',
      'เรียกเก็บลูกความ': 'ใช่/ไม่ เว้นว่าง = ใช่', 'สถานะ': 'ร่าง/จ่ายแล้ว เว้นว่าง = ร่าง จ่ายแล้วต้องมีสิทธิ์จัดการการเงิน; รายการซ้ำตรวจวันที่ รายการ จำนวนเงิน คดี ผู้เบิกและใบเสร็จ',
    },
    template: (lookups) => ({ dropdowns: [['หมวด', [...EXPENSE_CATEGORIES]], ['เรียกเก็บลูกความ', ['ใช่', 'ไม่']], ['สถานะ', ['ร่าง', 'จ่ายแล้ว']]], dateHeaders: ['วันที่ *'], examples: [['15/12/2569', 'ค่าเดินทางไปศาล', '1,250.00', lookups.cases[0]?.ownRef ?? '', EXPENSE_CATEGORIES[0], '', 'R-001', 'ใช่', 'ร่าง']], extraHelp: memberHelp(lookups.members) }),
    async lookups(db, user) {
      const refs = await staffCases(db, user, deps);
      const expenses = await db.expense.findMany({ where: {
        userId: { in: hasFirmCapability(user.firmRole, 'manageInvoices') ? refs.members.map((member) => member.id) : [user.id] },
        OR: [
          { caseId: { in: refs.cases.map((item) => item.id) }, case: { firmId: user.firmId } },
          // Standalone expenses have no firmId: only identities unambiguously belonging to this firm are safe.
          { caseId: null, user: { firmMembers: { some: { firmId: user.firmId }, every: { firmId: user.firmId } } } },
        ],
      }, select: { date: true, description: true, amount: true, caseId: true, userId: true, officialReceiptNo: true } });
      return { ...refs, existing: new Set(expenses.map((expense) => expenseSignature({ ...expense, caseId: expense.caseId ?? undefined, officialReceiptNo: expense.officialReceiptNo ?? undefined }))) };
    },
    resolve: resolveExpenseRows,
    async commit(tx, user, drafts) {
      for (const draft of drafts) await tx.expense.create({ data: {
        date: draft.date!, description: draft.description, amount: draft.amount!, caseId: draft.caseId, category: draft.category,
        userId: draft.userId, officialReceiptNo: draft.officialReceiptNo, billable: draft.billable, status: draft.status,
        paidAt: draft.status === ExpenseStatus.PAID ? draft.date : undefined,
        paidById: draft.status === ExpenseStatus.PAID ? user.id : undefined,
      } });
      return { created: drafts.length };
    },
  };
}
