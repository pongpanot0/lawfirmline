import { EXPENSE_CATEGORIES, MONEY_MAX } from '@lawfirm/shared';
import type { AgendaItem } from '@lawfirm/shared';

export function agendaCompanionNames(item: Pick<AgendaItem, 'assignees' | 'assigneeId'>) {
  return (Array.isArray(item.assignees) ? item.assignees : [])
    .filter((person) => person.id !== item.assigneeId)
    .map((person) => person.name).join(', ');
}

export function agendaIncludesPerson(item: Pick<AgendaItem, 'assignees' | 'assigneeId'>, userId: string) {
  return item.assigneeId === userId || (Array.isArray(item.assignees) && item.assignees.some((person) => person.id === userId));
}

export function expenseError(category: string, description: string, amount: string, complete: boolean) {
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return 'เลือกก่อนว่าเบิกค่าอะไร';
  if (category === 'อื่นๆ' && !description.trim()) return 'ระบุว่าเบิกค่าอะไรในช่องรายละเอียด';
  const number = Number(amount.replace(/,/g, ''));
  if ((complete || amount.trim()) && (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount.trim()) || !Number.isFinite(number) || number <= 0 || number > MONEY_MAX)) {
    return 'ใส่จำนวนเงินมากกว่า 0 ไม่เกินวงเงินระบบ และไม่เกิน 2 ตำแหน่งทศนิยม';
  }
  return null;
}

export function claimActions(status: string, owner: boolean): Array<'APPROVED' | 'REJECTED' | 'PAID'> {
  if (!owner) return [];
  if (status === 'PENDING') return ['APPROVED', 'REJECTED'];
  if (status === 'APPROVED') return ['PAID'];
  return [];
}
