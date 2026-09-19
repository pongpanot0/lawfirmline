// ตั้งใจไม่ import จาก './api' เพื่อให้ไฟล์นี้รันใน node --test ได้ตรง ๆ
type CustomerShare = {
  customerId: string;
  sharePercent?: number | null;
  customer: { name: string };
};

/**
 * ลูกค้า (ผู้ว่าจ้าง/ผู้จ่าย) ของคดี เขียนเป็นบรรทัดเดียว
 * "วิริยะ 60% · กรุงเทพประกันภัย 40%" — ตัด % ทิ้งเมื่อมีรายเดียว เพราะมันคือ 100% อยู่แล้ว
 */
export function formatCustomers(customers?: CustomerShare[] | null): string | null {
  if (!customers?.length) return null;
  if (customers.length === 1) return customers[0].customer.name;
  return customers
    .map((c) => (c.sharePercent == null ? c.customer.name : `${c.customer.name} ${c.sharePercent}%`))
    .join(' · ');
}

/** ลูกค้าเป็นคนเดียวกับลูกความ = เคสทั่วไป ไม่ต้องแสดงซ้ำสองบรรทัด */
export function customersSameAsClient(
  customers: CustomerShare[] | null | undefined,
  clientId: string | null | undefined,
): boolean {
  return Boolean(clientId) && customers?.length === 1 && customers[0].customerId === clientId;
}
