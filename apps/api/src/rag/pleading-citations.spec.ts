import { parseCitations } from './pleading-citations';

const sources = [
  { documentId: 'd1', filename: 'สัญญา.pdf', pageStart: 1, content: 'ก'.repeat(300) },
  { documentId: 'd2', filename: 'หนังสือทวงถาม.pdf', pageStart: null, content: 'ข้อความสั้น' },
];

describe('parseCitations', () => {
  it('collects cited sources and flags nothing when every paragraph cites', () => {
    const body = 'จำเลยทำสัญญากู้ยืมเงินกับโจทก์ [1]\n\nโจทก์มีหนังสือทวงถามแล้ว [2]';
    const result = parseCitations(body, sources);
    expect(result.unsupportedParagraphs).toEqual([]);
    expect(result.citations).toEqual([
      { n: 1, documentId: 'd1', filename: 'สัญญา.pdf', pageStart: 1, snippet: 'ก'.repeat(160) },
      { n: 2, documentId: 'd2', filename: 'หนังสือทวงถาม.pdf', pageStart: null, snippet: 'ข้อความสั้น' },
    ]);
  });

  it('flags a long paragraph without a marker', () => {
    const body = 'ข้อ ๑ [1]\n\nจำเลยได้รับเงินกู้ไปครบถ้วนแล้วแต่ไม่ชำระหนี้คืนตามกำหนดเวลาในสัญญาเลย';
    expect(parseCitations(body, sources).unsupportedParagraphs).toEqual([1]);
  });

  it('does not flag a short heading line', () => {
    const body = 'คำฟ้อง\n\nจำเลยทำสัญญากู้ยืมเงินกับโจทก์ [1]';
    expect(parseCitations(body, sources).unsupportedParagraphs).toEqual([]);
  });

  it('ignores markers outside the source range', () => {
    const body = 'จำเลยทำสัญญากู้ยืมเงินกับโจทก์ [9] และ [1] และ [1]';
    expect(parseCitations(body, sources).citations.map((c) => c.n)).toEqual([1]);
  });
});
