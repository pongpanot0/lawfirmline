/** Thai text for the browser's own form checks, so a Chrome set to English never shows "Please fill out this field." */
type Field = Pick<HTMLInputElement, 'type' | 'title' | 'minLength' | 'maxLength' | 'min' | 'max'> & { tagName: string; validity: ValidityState };

export function thaiValidityMessage(el: Field): string {
  const v = el.validity;
  if (v.valueMissing) {
    if (el.type === 'checkbox' || el.type === 'radio') return 'เลือกช่องนี้ก่อนไปต่อ';
    if (el.tagName === 'SELECT') return 'เลือกรายการนี้ก่อนไปต่อ';
    if (el.type === 'file') return 'เลือกไฟล์ก่อนไปต่อ';
    return 'กรอกช่องนี้ก่อนไปต่อ';
  }
  if (v.typeMismatch) {
    if (el.type === 'email') return 'อีเมลต้องมี @ เช่น name@example.com';
    if (el.type === 'url') return 'ลิงก์ต้องขึ้นต้นด้วย https:// เช่น https://example.com';
    return 'รูปแบบไม่ถูกต้อง ตรวจแล้วกรอกใหม่';
  }
  if (v.patternMismatch) return el.title ? `รูปแบบไม่ถูกต้อง — ${el.title}` : 'รูปแบบไม่ถูกต้อง ตรวจแล้วกรอกใหม่';
  if (v.tooShort) return `ต้องมีอย่างน้อย ${el.minLength} ตัวอักษร`;
  if (v.tooLong) return `ยาวได้ไม่เกิน ${el.maxLength} ตัวอักษร`;
  if (v.rangeUnderflow) return `ต้องไม่น้อยกว่า ${el.min}`;
  if (v.rangeOverflow) return `ต้องไม่เกิน ${el.max}`;
  if (v.stepMismatch) return 'ตัวเลขละเอียดเกินที่กำหนด ปัดเศษแล้วกรอกใหม่';
  if (v.badInput) return el.type === 'number' ? 'กรอกเป็นตัวเลข' : 'ข้อมูลไม่ถูกต้อง ตรวจแล้วกรอกใหม่';
  return '';
}
