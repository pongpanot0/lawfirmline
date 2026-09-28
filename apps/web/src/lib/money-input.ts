/** Keep form state numeric while showing thousands separators to the user. */
export function normalizeMoneyInput(text: string): string | null {
  const raw = text.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50))
    .replace(/[\s,฿]/g, '');
  if (!/^\d*(?:\.\d{0,2})?$/.test(raw)) return null;
  const [whole, fraction] = raw.split('.');
  const cleanWhole = whole.replace(/^0+(?=\d)/, '') || (fraction === undefined ? '' : '0');
  return fraction === undefined ? cleanWhole : `${cleanWhole}.${fraction}`;
}

export function formatMoneyInput(value: string | number): string {
  const raw = String(value);
  if (!/^\d*(?:\.\d*)?$/.test(raw)) return raw;
  const [whole, fraction] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
