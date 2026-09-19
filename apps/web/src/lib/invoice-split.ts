/**
 * แบ่งยอดตามสัดส่วน แล้วโยนเศษที่ปัดทิ้งไปไว้กับรายสุดท้าย
 * ต้องให้ผลตรงกับ BillingService.allocate ฝั่ง API ไม่งั้นตัวอย่างที่โชว์ก่อนกดออกบิล
 * จะไม่ตรงกับใบที่ออกจริง
 */
export function allocateShares(total: number, shares: number[]): number[] {
  const sumShares = shares.reduce((sum, share) => sum + share, 0);
  if (sumShares <= 0) return shares.map(() => 0);
  const amounts = shares.map((share) => Math.round((total * share * 100) / sumShares) / 100);
  const allocated = amounts.reduce((sum, amount) => sum + amount, 0);
  amounts[amounts.length - 1] = Math.round((amounts[amounts.length - 1] + total - allocated) * 100) / 100;
  return amounts;
}
