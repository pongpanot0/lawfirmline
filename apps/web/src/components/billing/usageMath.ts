export function savingsPercent(firstPrice: number, firstUnits: number, price: number, units: number): number {
  return Math.max(0, Math.floor((1 - (price / units) / (firstPrice / firstUnits)) * 100));
}

export function nextBangkokMonth(now: Date): Date {
  const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth() + 1, 1));
}
