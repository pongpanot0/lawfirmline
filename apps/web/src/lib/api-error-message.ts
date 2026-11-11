const THAI = /[฀-๿]/;

/** The message the API sent, as-is (may be English or a code such as TASK_LABELS_TOO_MANY). */
export function rawApiErrorMessage(body: unknown, fallback: string): string {
  const payload = (body ?? {}) as { message?: string | string[] | { message?: string } };
  if (Array.isArray(payload.message)) return payload.message.join(', ');
  if (typeof payload.message === 'string') return payload.message;
  if (payload.message && typeof payload.message === 'object' && payload.message.message) return payload.message.message;
  return fallback;
}

/**
 * What the user sees: the API's own Thai text when it wrote one, otherwise a Thai sentence for the
 * status that says what happened and what to do — never a raw English server message on a Thai screen.
 */
export function displayApiErrorMessage(raw: string, status: number): string {
  if (THAI.test(raw)) return raw;
  if (status === 400 || status === 422) return 'ข้อมูลที่ส่งไม่ถูกต้อง ตรวจช่องที่กรอกแล้วลองอีกครั้ง';
  if (status === 401) return 'หมดเวลาการเข้าสู่ระบบ เข้าสู่ระบบใหม่แล้วลองอีกครั้ง';
  if (status === 403) return 'บัญชีของคุณไม่มีสิทธิ์ใช้ส่วนนี้ ติดต่อเจ้าของหรือผู้จัดการสำนักงานหากต้องใช้';
  if (status === 404) return 'ไม่พบข้อมูลนี้ อาจถูกลบไปแล้วหรือคุณไม่มีสิทธิ์เปิด';
  if (status === 409) return 'ข้อมูลนี้ถูกแก้ไปแล้วหรือมีอยู่แล้ว โหลดหน้าใหม่แล้วลองอีกครั้ง';
  if (status === 410) return 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ขอลิงก์ใหม่อีกครั้ง';
  if (status === 413) return 'ไฟล์ใหญ่เกินกำหนด เลือกไฟล์ที่เล็กลงแล้วลองอีกครั้ง';
  if (status === 429) return 'ทำรายการถี่เกินไป รอสักครู่แล้วลองอีกครั้ง';
  if (status >= 500) return 'ระบบขัดข้องชั่วคราว ลองอีกครั้งในอีกสักครู่';
  return 'ทำรายการไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง';
}
