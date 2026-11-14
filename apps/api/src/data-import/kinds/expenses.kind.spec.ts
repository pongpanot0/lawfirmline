import { ExpenseStatus, FirmRole, MONEY_MAX } from '@lawfirm/shared';
import { expenseSignature, resolveExpenseRows } from './expenses.kind';
import { importUser, row, staffLookups } from './import-kind.fixtures';

const base = { 'วันที่ *': '15/12/2569', 'รายการ *': 'เดินทางไปศาล', 'จำนวนเงิน (บาท) *': '1,250.50' };
const claimant = 'ผู้เบิก (อีเมล; ว่าง = ผู้นำเข้า)';
const one = (values: Record<string, string> = {}, user = importUser) => resolveExpenseRows([row({ ...base, ...values })], staffLookups(), user)[0];
describe('expenses import resolver', () => {
  it('defaults claimant, billable, and draft; financial managers can record paid expenses for staff', () => {
    expect(one()).toMatchObject({ problems: [], userId: 'owner', billable: true, status: ExpenseStatus.DRAFT, amount: 1250.5, caseId: undefined });
    expect(one({ [claimant]: 'assistant@example.com', เลขอ้างอิงคดี: 'REF001', หมวด: 'ค่าเดินทาง', สถานะ: 'จ่ายแล้ว', เรียกเก็บลูกความ: 'ไม่', เลขที่ใบเสร็จ: 'R001' })).toMatchObject({ problems: [], userId: 'assistant', caseId: 'case-a', status: ExpenseStatus.PAID, billable: false, refs: { userIds: ['assistant'] } });
  });
  it.each([
    [{ 'วันที่ *': '' }, 'วันที่'], [{ 'รายการ *': '' }, 'รายการ'], [{ 'จำนวนเงิน (บาท) *': '' }, 'จำนวนเงิน'],
    [{ 'วันที่ *': '31/02/2569' }, 'วันที่ไม่ถูกต้อง'], [{ 'จำนวนเงิน (บาท) *': '-1' }, 'จำนวนเงินไม่ถูกต้อง'], [{ 'จำนวนเงิน (บาท) *': '1,2' }, 'จำนวนเงินไม่ถูกต้อง'],
    [{ 'จำนวนเงิน (บาท) *': 'Infinity' }, 'จำนวนเงินไม่ถูกต้อง'], [{ 'จำนวนเงิน (บาท) *': '0' }, 'ต้องอยู่ระหว่าง'], [{ 'จำนวนเงิน (บาท) *': String(MONEY_MAX + 1) }, 'ต้องอยู่ระหว่าง'],
    [{ เลขอ้างอิงคดี: 'FOREIGN' }, 'ไม่พบคดี FOREIGN หรือคุณไม่มีสิทธิ์ในคดีนี้'], [{ [claimant]: 'invalid' }, 'อีเมลไม่ถูกต้อง'], [{ [claimant]: 'external@example.com' }, 'ไม่พบสมาชิก'],
    [{ หมวด: 'ไม่ทราบ' }, 'หมวด'], [{ สถานะ: 'ส่งแล้ว' }, 'สถานะ'], [{ เรียกเก็บลูกความ: 'อาจจะ' }, 'ใช่ หรือ ไม่'],
    [{ 'รายการ *': 'x'.repeat(501) }, 'ยาวเกิน 500'], [{ หมวด: 'x'.repeat(101) }, 'ยาวเกิน 100'], [{ เลขที่ใบเสร็จ: 'x'.repeat(101) }, 'ยาวเกิน 100'],
  ] as [Record<string, string>, string][])('reports invalid expense cells %p', (values, expected) => expect(one(values).problems.join(' ')).toContain(expected));
  it('rejects missing importer membership, another claimant or PAID without financial capability', () => {
    expect(one({}, { ...importUser, id: 'unknown' }).problems.join(' ')).toContain('ไม่พบสมาชิก');
    const lawyer = { ...importUser, id: 'lawyer', firmRole: FirmRole.LAWYER };
    expect(one({ [claimant]: 'owner@example.com', สถานะ: 'จ่ายแล้ว' }, lawyer).problems.join(' ')).toMatch(/ไม่มีสิทธิ์ระบุผู้เบิก.*ไม่มีสิทธิ์นำเข้า/);
    expect(one({}, { ...importUser, firmRole: FirmRole.EXTERNAL }).problems.join(' ')).toContain('ไม่มีสิทธิ์');
  });
  it('rejects in-file and existing expense signatures', () => {
    const lookups = staffLookups(); lookups.existing.add(expenseSignature(one()));
    expect(resolveExpenseRows([row(base)], lookups, importUser)[0].problems.join(' ')).toContain('ในระบบแล้ว');
    expect(resolveExpenseRows([row(base), row(base, 3)], staffLookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
  });
});
