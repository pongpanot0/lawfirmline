import { ExpenseStatus } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';

/**
 * Work that can still be billed: not on an invoice and not written off.
 * Every unbilled total/draft/claim goes through these so a write-off hides a row everywhere at once.
 */
export const unbilledTimeWhere = (): Prisma.TimeEntryWhereInput => ({
  billable: true,
  invoiceId: null,
  writtenOffAt: null,
});

export const unbilledExpenseWhere = (): Prisma.ExpenseWhereInput => ({
  billable: true,
  invoiceId: null,
  writtenOffAt: null,
  status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PAID] },
});
