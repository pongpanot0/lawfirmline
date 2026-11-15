export type DocumentType = 'INVOICE' | 'RECEIPT';
export type BlockType = 'logo' | 'firm' | 'firmTax' | 'title' | 'meta' | 'customer' | 'items' | 'totals'
  | 'words' | 'payment' | 'promptpay' | 'bank' | 'note' | 'signatures' | 'stamp';
export interface TemplateBlock {
  id: string;
  type: BlockType;
  column: 'left' | 'right' | 'full';
  hidden?: boolean;
  settings?: { text?: string; columns?: string[]; groupByTaxClass?: boolean; fontSize?: 'sm' | 'md' | 'lg';
    bankName?: string; accountName?: string; accountNo?: string; promptpayId?: string; logoSize?: number };
}
export interface TemplateLayout { version: 1; blocks: TemplateBlock[] }

export const REQUIRED_VAT_BLOCKS: readonly BlockType[] = ['firm', 'firmTax', 'title', 'meta', 'customer', 'items', 'totals'];
const BLOCK_TYPES: readonly BlockType[] = ['logo', ...REQUIRED_VAT_BLOCKS, 'words', 'payment', 'promptpay', 'bank', 'note', 'signatures', 'stamp'];

export const STANDARD_V1_LAYOUT: TemplateLayout = {
  version: 1,
  blocks: [
    { id: 'logo', type: 'logo', column: 'left' },
    { id: 'firm', type: 'firm', column: 'left' },
    { id: 'firmTax', type: 'firmTax', column: 'left' },
    { id: 'title', type: 'title', column: 'right' },
    { id: 'meta', type: 'meta', column: 'right' },
    { id: 'customer', type: 'customer', column: 'full' },
    { id: 'items', type: 'items', column: 'full' },
    { id: 'words', type: 'words', column: 'left' },
    { id: 'payment', type: 'payment', column: 'left' },
    { id: 'totals', type: 'totals', column: 'right' },
    { id: 'signatures', type: 'signatures', column: 'full' },
  ],
};

/** Accept unknown because layouts arrive as JSON from both the API and stored templates. */
export function validateTemplateLayout(layout: unknown, options: { vatRegistered: boolean; docType: DocumentType }): string[] {
  const errors: string[] = [];
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return ['รูปแบบเอกสารไม่ถูกต้อง'];
  const value = layout as TemplateLayout;
  if (value.version !== 1) errors.push('รองรับรูปแบบเอกสารรุ่น 1 เท่านั้น');
  if (!Array.isArray(value.blocks)) return [...errors, 'ระบุรายการบล็อกเอกสาร'];
  if (value.blocks.length > 30) errors.push('เอกสารมีได้ไม่เกิน 30 บล็อก');
  const ids = new Set<string>();
  for (const block of value.blocks) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) { errors.push('บล็อกเอกสารไม่ถูกต้อง'); continue; }
    if (typeof block.id !== 'string' || !block.id.trim() || ids.has(block.id)) errors.push('รหัสบล็อกต้องไม่ว่างและไม่ซ้ำกัน');
    ids.add(block.id);
    if (!BLOCK_TYPES.includes(block.type)) errors.push('ประเภทบล็อกไม่ถูกต้อง');
    if (!['left', 'right', 'full'].includes(block.column)) errors.push('เลือกตำแหน่งบล็อกซ้าย ขวา หรือเต็มแถว');
    if (block.hidden !== undefined && typeof block.hidden !== 'boolean') errors.push('สถานะซ่อนบล็อกต้องเป็นจริงหรือเท็จ');
    const s = block.settings;
    if (s !== undefined) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push('การตั้งค่าบล็อกไม่ถูกต้อง'); continue; }
      if (s.text !== undefined && (typeof s.text !== 'string' || s.text.length > 1000)) errors.push('ข้อความในบล็อกต้องไม่เกิน 1,000 ตัวอักษร');
      for (const key of ['bankName', 'accountName', 'accountNo'] as const) {
        if (s[key] !== undefined && (typeof s[key] !== 'string' || s[key]!.length > 1000)) errors.push('ข้อมูลบัญชีต้องเป็นข้อความไม่เกิน 1,000 ตัวอักษร');
      }
      if (s.promptpayId !== undefined && (typeof s.promptpayId !== 'string' || !/^(?:\d{10}|\d{13})$/.test(s.promptpayId))) errors.push('พร้อมเพย์ต้องเป็นตัวเลข 10 หรือ 13 หลัก');
      if (s.columns !== undefined && (!Array.isArray(s.columns) || s.columns.some(c => typeof c !== 'string'))) errors.push('คอลัมน์ต้องเป็นรายการข้อความ');
      if (s.fontSize !== undefined && !['sm', 'md', 'lg'].includes(s.fontSize)) errors.push('เลือกขนาดตัวอักษรเล็ก กลาง หรือใหญ่');
      if (s.groupByTaxClass !== undefined && typeof s.groupByTaxClass !== 'boolean') errors.push('สถานะจัดกลุ่มภาษีไม่ถูกต้อง');
      if (s.logoSize !== undefined && (typeof s.logoSize !== 'number' || !Number.isFinite(s.logoSize) || s.logoSize <= 0)) errors.push('ขนาดโลโก้ต้องมากกว่า 0');
    }
  }
  if (options.vatRegistered) {
    for (const type of REQUIRED_VAT_BLOCKS) {
      if (!value.blocks.some(b => b?.type === type && b.hidden !== true)) errors.push(`สำนักงานจด VAT ต้องแสดงบล็อก ${type}`);
      else if (value.blocks.some(b => b?.type === type && b.hidden === true)) errors.push(`สำนักงานจด VAT ซ่อนบล็อก ${type} ไม่ได้`);
    }
  }
  return errors;
}
