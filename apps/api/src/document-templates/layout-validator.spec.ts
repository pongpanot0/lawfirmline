import { REQUIRED_VAT_BLOCKS, STANDARD_V1_LAYOUT, TemplateLayout, validateTemplateLayout } from '@lawfirm/shared';

const layout = (): TemplateLayout => JSON.parse(JSON.stringify(STANDARD_V1_LAYOUT));
const vat = { vatRegistered: true, docType: 'RECEIPT' as const };

describe('shared document template layout validator', () => {
  it.each(['INVOICE', 'RECEIPT'] as const)('accepts the standard %s layout and column order', docType => {
    expect(validateTemplateLayout(layout(), { ...vat, docType })).toEqual([]);
    expect(STANDARD_V1_LAYOUT.blocks.map(b => [b.type, b.column])).toEqual([
      ['logo', 'left'], ['firm', 'left'], ['firmTax', 'left'], ['title', 'right'], ['meta', 'right'],
      ['customer', 'full'], ['items', 'full'], ['words', 'left'], ['payment', 'left'], ['totals', 'right'], ['signatures', 'full'],
    ]);
  });
  it.each(REQUIRED_VAT_BLOCKS)('VAT disallows hiding or removing %s', type => {
    const value = layout();
    value.blocks.find(b => b.type === type)!.hidden = true;
    expect(validateTemplateLayout(value, vat)).toContain(`สำนักงานจด VAT ต้องแสดงบล็อก ${type}`);
    value.blocks = value.blocks.filter(b => b.type !== type);
    expect(validateTemplateLayout(value, vat)).toContain(`สำนักงานจด VAT ต้องแสดงบล็อก ${type}`);
    expect(validateTemplateLayout(value, { ...vat, vatRegistered: false })).toEqual([]);
  });
  it('non-VAT may hide all required blocks', () => {
    const value = layout(); value.blocks.forEach(b => { b.hidden = true; });
    expect(validateTemplateLayout(value, { ...vat, vatRegistered: false })).toEqual([]);
  });
  it('rejects an unknown type, more than 30 blocks, and long text', () => {
    const value = layout();
    (value.blocks[0] as any).type = 'script';
    expect(validateTemplateLayout(value, vat)).toContain('ประเภทบล็อกไม่ถูกต้อง');
    value.blocks = Array.from({ length: 31 }, (_, i) => ({ id: String(i), type: 'note', column: 'full', settings: { text: 'x'.repeat(1001) } }));
    expect(validateTemplateLayout(value, vat)).toEqual(expect.arrayContaining(['เอกสารมีได้ไม่เกิน 30 บล็อก', 'ข้อความในบล็อกต้องไม่เกิน 1,000 ตัวอักษร']));
  });
  it.each(['0812345678', '1234567890123'])('accepts promptpay %s', promptpayId => {
    const value = layout(); value.blocks[0].settings = { promptpayId };
    expect(validateTemplateLayout(value, vat)).toEqual([]);
  });
  it.each(['123', '081-234-5678', 1234567890])('rejects malformed promptpay %s', promptpayId => {
    const value = layout(); value.blocks[0].settings = { promptpayId } as any;
    expect(validateTemplateLayout(value, vat)).toContain('พร้อมเพย์ต้องเป็นตัวเลข 10 หรือ 13 หลัก');
  });
  it.each([null, [], { version: 1 }, { version: 2, blocks: [null] }, { version: 1, blocks: [{ id: '', type: 'logo', column: 'bad', settings: [] }] }])('rejects malformed JSON without throwing: %j', value => {
    expect(validateTemplateLayout(value, vat).length).toBeGreaterThan(0);
  });
});
