type AdvanceBalance = { remaining: number; settledAt: string | null };

export function canReturnCashAdvance(advance: AdvanceBalance, amount: number) {
  return !advance.settledAt && Number.isFinite(amount) && amount > 0 && amount <= advance.remaining;
}

export function canSettleCashAdvance(advance: AdvanceBalance) {
  return !advance.settledAt && advance.remaining === 0;
}
