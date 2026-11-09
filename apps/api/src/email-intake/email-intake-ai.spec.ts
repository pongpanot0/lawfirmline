import { parseIntakeAiResult } from './email-intake-ai';
import { extractFieldsFromEmailBody } from './field-extraction.util';

const messages = [
  { id: 'm1', text: 'เรื่องที่ 1 นพ.ก ผู้เสียหายเรียกร้อง 1,000,000 บาท บริษัทประกันจ่ายไปแล้ว 300,000 บาท\nเรื่องที่ 2 นพ.ข เรียกร้อง 500,000 บาท' },
  { id: 'm2', text: 'ขอบคุณค่ะ' },
];
const ref = (amount: number, quote: string, sourceMessageId = 'm1') => ({ amount, quote, sourceMessageId });

describe('parseIntakeAiResult', () => {
  it('keeps two matters apart, each amount labelled with its matter', () => {
    const out = parseIntakeAiResult(
      JSON.stringify({
        matters: [
          { label: 'นพ.ก', summary: 'ขอให้ตรวจยอด', claimedAmount: ref(1000000, 'เรียกร้อง 1,000,000 บาท'), insurerPaidAmount: ref(300000, 'ประกันจ่ายไปแล้ว 300,000 บาท'), otherAmounts: [] },
          { label: 'นพ.ข', summary: null, claimedAmount: ref(500000, 'นพ.ข เรียกร้อง 500,000 บาท'), insurerPaidAmount: null, otherAmounts: [] },
        ],
      }),
      messages,
    );
    expect(out.map((p) => [p.field, p.value])).toEqual([
      ['estimatedDamage', '1000000'],
      ['insurerPaidAmount', '300000'],
      ['description', '[นพ.ก] ขอให้ตรวจยอด'],
      ['estimatedDamage', '500000'],
    ]);
    expect(out[0].sourceDetail).toContain('นพ.ก');
    expect(out[3].sourceDetail).toContain('นพ.ข');
    expect(out[0].sourceMessageId).toBe('m1');
  });

  it('drops an amount whose quote is not in the cited message (no invented values)', () => {
    const out = parseIntakeAiResult(
      JSON.stringify({ matters: [{ label: 'x', summary: null, claimedAmount: ref(9, 'เรียกร้อง 9 บาท'), insurerPaidAmount: ref(300000, 'ประกันจ่ายไปแล้ว 300,000 บาท', 'm2'), otherAmounts: [] }] }),
      messages,
    );
    expect(out).toEqual([]);
  });

  it('returns nothing for malformed output', () => {
    expect(parseIntakeAiResult('not json', messages)).toEqual([]);
    expect(parseIntakeAiResult('{"matters":"x"}', messages)).toEqual([]);
  });
});

describe('extractFieldsFromEmailBody amounts', () => {
  it('labels each amount by the words before it', () => {
    const fields = extractFieldsFromEmailBody(messages[0].text).filter((f) => f.field !== 'description');
    expect(fields.map((f) => [f.field, f.value])).toEqual([
      ['estimatedDamage', '1000000'],
      ['insurerPaidAmount', '300000'],
      ['estimatedDamage', '500000'],
    ]);
  });

  it('ignores amounts in the quoted history', () => {
    const body = 'ขอบคุณค่ะ\n\nFrom: Suchanya <s@x.com>\nSent: Tuesday\nเรียกร้อง 1,000,000 บาท';
    expect(extractFieldsFromEmailBody(body).map((f) => f.field)).toEqual(['description']);
  });
});
