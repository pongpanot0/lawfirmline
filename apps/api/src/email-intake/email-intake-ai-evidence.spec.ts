import { PartyRole } from '../generated/prisma';
import { amountsIn, caseNumberFromTitle, ourRoleFromOpponentQuote, parseIntakeAiResult, quoteStatesAmount } from './email-intake-ai';

const source = 'คดีแพ่งของศาลแพ่งธนบุรี หมายเลขคดีดำที่ ผบ.181/2569 ระหว่าง นายรอยบุญ เลาหะวิไลย โจทก์ บมจ. ธนบุรี เมดิเคิล เซ็นเตอร์ จำเลยที่ 1 โจทก์ฟ้องเรียกค่าเสียหาย 10,000,000 บาท จำเลยที่ 1 ได้ชำระเงินค่าเสียหายให้แก่โจทก์เป็นเงิน 1,500,000 บาท';
const messages = [{ id: 'm1', text: source }];
const text = (value: string, quote: string) => ({ value, quote, sourceMessageId: 'm1', sourceDocumentId: null });
const amount = (n: number, quote: string) => ({ amount: n, quote, sourceMessageId: 'm1', sourceDocumentId: null });
const run = (matter: Record<string, unknown>) => parseIntakeAiResult(JSON.stringify({ matters: [{ label: 'x', summary: null, otherAmounts: [], ...matter }] }), messages);

describe('AI evidence rules', () => {
  it('reads plain and Thai-unit amounts', () => {
    expect(amountsIn('เป็นเงิน 1,500,000.00 บาท และอีก 10 ล้านบาท ๒,๐๐๐ บาท')).toEqual([1500000, 10000000, 2000]);
    expect(quoteStatesAmount('ได้ชำระเงิน 1,500,000 บาท', 10000000)).toBe(false);
  });

  it('replaces a quote that talks about another figure with the sentence that states the amount', () => {
    const [p] = run({ claimedAmount: amount(10000000, 'จำเลยที่ 1 ได้ชำระเงินค่าเสียหายให้แก่โจทก์เป็นเงิน 1,500,000 บาท') });
    expect(p.field).toBe('estimatedDamage');
    expect(p.sourceDetail).toContain('10,000,000');
    expect(p.sourceDetail).not.toContain('1,500,000');
  });

  it('drops an amount the source never states', () => {
    expect(run({ claimedAmount: amount(7000000, 'โจทก์ฟ้องเรียกค่าเสียหาย 10,000,000 บาท') })).toEqual([]);
  });

  it('files a court number given as the title as the black case number, once', () => {
    expect(caseNumberFromTitle('คดี ผบ.181/2569')).toBe('ผบ.181/2569');
    expect(caseNumberFromTitle('เคลมประกันวิชาชีพแพทย์')).toBeNull();
    const out = run({ title: text('คดี ผบ.181/2569', 'หมายเลขคดีดำที่ ผบ.181/2569'), externalCaseNumber: text('ผบ.181/2569', 'หมายเลขคดีดำที่ ผบ.181/2569') });
    expect(out.map((p) => [p.field, p.value])).toEqual([['externalCaseNumber', 'ผบ.181/2569']]);
  });

  it('reads which side the other party is on from the word after their name', () => {
    expect(ourRoleFromOpponentQuote('นายรอยบุญ เลาหะวิไลย', 'ระหว่าง นายรอยบุญ เลาหะวิไลย โจทก์')).toBe(PartyRole.DEFENDANT);
    expect(ourRoleFromOpponentQuote('บริษัท ก', 'บริษัท ก จำเลย')).toBe(PartyRole.PLAINTIFF);
    const out = run({ opposingParty: text('นายรอยบุญ เลาหะวิไลย', 'ระหว่าง นายรอยบุญ เลาหะวิไลย โจทก์') });
    expect(out.map((p) => [p.field, p.value])).toEqual([['opposingParty', 'นายรอยบุญ เลาหะวิไลย'], ['partyRole', PartyRole.DEFENDANT]]);
  });

  it('keeps the AI’s own party role over the inferred one', () => {
    const out = run({ opposingParty: text('นายรอยบุญ เลาหะวิไลย', 'ระหว่าง นายรอยบุญ เลาหะวิไลย โจทก์'), partyRole: text(PartyRole.PLAINTIFF, 'ระหว่าง นายรอยบุญ เลาหะวิไลย โจทก์') });
    expect(out.filter((p) => p.field === 'partyRole').map((p) => p.value)).toEqual([PartyRole.PLAINTIFF]);
  });
});
