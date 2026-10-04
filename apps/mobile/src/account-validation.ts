/** UTF-8 size without relying on TextEncoder being installed in the native runtime. */
export function passwordByteLength(value: string): number {
  return Array.from(value).reduce((size, character) => {
    const point = character.codePointAt(0)!;
    return size + (point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4);
  }, 0);
}

export function passwordError(password: string, confirmation: string): string | null {
  if (password.length < 8) return 'ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร';
  if (passwordByteLength(password) > 72) return 'รหัสผ่านยาวเกินไป ลดจำนวนตัวอักษรแล้วลองใหม่';
  if (password !== confirmation) return 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
  return null;
}
