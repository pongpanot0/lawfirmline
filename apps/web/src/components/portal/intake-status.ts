/** Badge tint for the client-facing intake status text (the text itself is shown as-is). */
export const INTAKE_STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'destructive'> = {
  สำนักงานรับเรื่องแล้ว: 'muted',
  รอตกลงขอบเขต: 'warning',
  รับดำเนินการ: 'success',
  ไม่รับดำเนินการ: 'destructive',
  ให้คำปรึกษาเรียบร้อยแล้ว: 'muted',
  ส่งแล้ว: 'muted',
};
