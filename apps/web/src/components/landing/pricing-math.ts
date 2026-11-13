export function perPersonMonthly(price: number, maxUsers: number, yearly: boolean, billedMonths: number): number {
  return Math.round((yearly ? price * billedMonths / 12 : price) / maxUsers);
}
