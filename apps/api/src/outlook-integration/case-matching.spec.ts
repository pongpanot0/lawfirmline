import { MatchableCase, suggestCaseMatches, toMatchableCase } from './case-matching';

const cases: MatchableCase[] = [
  {
    id: 'c1',
    ownRef: 'TSBREF20250001',
    title: 'ผิดสัญญาซื้อขาย',
    clientName: 'บริษัท เอบีซี จำกัด',
    caseNumbers: ['ผบ.1234/2567'],
  },
  {
    id: 'c2',
    ownRef: 'TSBREF20250002',
    title: 'เรียกค่าเสียหาย',
    clientName: 'นายสมชาย ใจดี',
    caseNumbers: ['พ.88/2566', 'ฎ.5/2568'],
  },
];

describe('suggestCaseMatches', () => {
  it('suggests the case whose Own Ref appears in the folder name (case-insensitive)', () => {
    expect(suggestCaseMatches('TSBREF20250001 เอบีซี', cases)).toEqual([
      { caseId: 'c1', ownRef: 'TSBREF20250001', title: 'ผิดสัญญาซื้อขาย', reason: 'OWN_REF', matchedText: 'TSBREF20250001' },
    ]);
    expect(suggestCaseMatches('คดี tsbref20250002', cases)[0]).toMatchObject({ caseId: 'c2', reason: 'OWN_REF' });
  });

  it('does not match an Own Ref glued to more digits', () => {
    expect(suggestCaseMatches('TSBREF202500011', cases)).toEqual([]);
  });

  it('matches black/red numbers, including proceedings, by number/year with any separator', () => {
    expect(suggestCaseMatches('1234-2567 ค่าสินค้า', cases)).toEqual([
      { caseId: 'c1', ownRef: 'TSBREF20250001', title: 'ผิดสัญญาซื้อขาย', reason: 'CASE_NUMBER', matchedText: 'ผบ.1234/2567' },
    ]);
    expect(suggestCaseMatches('ฎีกา 5_2568', cases)[0]).toMatchObject({ caseId: 'c2', reason: 'CASE_NUMBER', matchedText: 'ฎ.5/2568' });
  });

  it('does not treat a longer number as the same case number', () => {
    expect(suggestCaseMatches('11234/2567', cases)).toEqual([]);
    expect(suggestCaseMatches('1234/25670', cases)).toEqual([]);
  });

  it('matches the client name ignoring company/person affixes and spacing', () => {
    expect(suggestCaseMatches('เอบีซี จำกัด (ค่าสินค้า)', cases)[0]).toMatchObject({ caseId: 'c1', reason: 'CLIENT_NAME' });
    expect(suggestCaseMatches('คดีสมชาย ใจดี', cases)[0]).toMatchObject({ caseId: 'c2', reason: 'CLIENT_NAME' });
  });

  it('keeps one suggestion per case and orders OWN_REF before CASE_NUMBER before CLIENT_NAME', () => {
    expect(suggestCaseMatches('สมชาย ใจดี TSBREF20250001', cases).map((s) => [s.caseId, s.reason])).toEqual([
      ['c1', 'OWN_REF'],
      ['c2', 'CLIENT_NAME'],
    ]);
    expect(suggestCaseMatches('TSBREF20250001 เอบีซี 1234/2567', cases)).toHaveLength(1);
  });

  it('ignores refs/names shorter than 3 characters and empty folder names', () => {
    const tiny: MatchableCase[] = [{ id: 'c3', ownRef: 'A1', title: 'x', clientName: 'AB', caseNumbers: [] }];
    expect(suggestCaseMatches('A1 AB', tiny)).toEqual([]);
    expect(suggestCaseMatches('   ', cases)).toEqual([]);
  });
});

describe('toMatchableCase', () => {
  it('merges case and proceeding numbers, drops blanks/duplicates, prefers the client record name', () => {
    expect(
      toMatchableCase({
        id: 'c9',
        ownRef: 'R9',
        title: 'คดี 9',
        clientName: 'ชื่อเดิม',
        blackCaseNumber: 'ผบ.1/2567',
        redCaseNumber: null,
        client: null,
        proceedings: [
          { blackCaseNumber: 'ผบ.1/2567', redCaseNumber: 'ผ.9/2568' },
          { blackCaseNumber: null, redCaseNumber: '  ' },
        ],
      }),
    ).toEqual({ id: 'c9', ownRef: 'R9', title: 'คดี 9', clientName: 'ชื่อเดิม', caseNumbers: ['ผบ.1/2567', 'ผ.9/2568'] });

    expect(
      toMatchableCase({
        id: 'c8', ownRef: 'R8', title: 't', clientName: 'ชื่อเดิม', blackCaseNumber: null, redCaseNumber: null,
        client: { name: 'บริษัท ใหม่ จำกัด' }, proceedings: [],
      }).clientName,
    ).toBe('บริษัท ใหม่ จำกัด');
  });
});
