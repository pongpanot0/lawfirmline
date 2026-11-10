import { INTAKE_AI_RESPONSE_FORMAT, parseIntakeAiResult, parseIntakeAiSummary } from './email-intake-ai';
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
          { label: 'นพ.ก', summary: { value: 'ขอให้ตรวจยอด', quote: 'ผู้เสียหายเรียกร้อง', sourceMessageId: 'm1' }, claimedAmount: ref(1000000, 'เรียกร้อง 1,000,000 บาท'), insurerPaidAmount: ref(300000, 'ประกันจ่ายไปแล้ว 300,000 บาท'), otherAmounts: [] },
          { label: 'นพ.ข', summary: null, claimedAmount: ref(500000, 'นพ.ข เรียกร้อง 500,000 บาท'), insurerPaidAmount: null, otherAmounts: [] },
        ],
      }),
      messages,
    );
    expect(out.map((p) => [p.field, p.value])).toEqual([
      ['estimatedDamage', '1000000'],
      ['insurerPaidAmount', '300000'],
      ['description', 'ขอให้ตรวจยอด'],
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


  it('drops amounts, text and dates whose quote is absent or belongs to a different document', () => {
    const docRef = (value: string, quote: string, sourceDocumentId = 'd2') => ({ value, quote, sourceDocumentId, sourceMessageId: null });
    const out = parseIntakeAiResult(JSON.stringify({ matters: [{
      label: 'เรื่อง', claimedAmount: { amount: 82400, quote: 'ค่ารักษา 82,400 บาท', sourceDocumentId: 'd2' },
      clientName: docRef('สมศรี', 'สมศรี'), incidentDate: docRef('2026-10-31', '31/10/2569'),
      summary: docRef('สรุปไม่มีหลักฐาน', 'ไม่มีหลักฐาน'),
    }] }), [], [{ id: 'd1', text: 'สมศรี ค่ารักษา 82,400 บาท 31/10/2569' }, { id: 'd2', text: 'another source' }]);
    expect(out).toEqual([]);
  });

  it('keeps supported document values with sourceDocumentId and converts Buddhist dates', () => {
    const source = { sourceDocumentId: 'd1', sourceMessageId: null };
    const out = parseIntakeAiResult(JSON.stringify({ matters: [{ label: 'สมศรี',
      insurerPaidAmount: { ...source, amount: 82400, quote: 'จ่าย 82,400 บาท' },
      clientName: { ...source, value: 'สมศรี', quote: 'สมศรี' },
      incidentDate: { ...source, value: '2569-10-31', quote: '31/10/2569' },
      otherAmounts: [{ ...source, amount: 200, meaning: 'ค่าตรวจ', quote: 'ค่าตรวจ 200 บาท' }],
    }] }), [], [{ id: 'd1', text: 'สมศรี จ่าย 82,400 บาท 31/10/2569 ค่าตรวจ 200 บาท' }]);
    expect(out).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'insurerPaidAmount', value: '82400', sourceDocumentId: 'd1', sourceMessageId: null, matterLabel: null }),
      expect.objectContaining({ field: 'incidentDate', value: '2026-10-31' }),
      expect.objectContaining({ field: 'otherAmount', value: '{"label":"ค่าตรวจ","amount":200}' }),
    ]));
    expect(out[0].sourceDetail).toContain('สมศรี');
  });

  it('keeps matterLabel separate from text and rejects ungrounded plain summaries', () => {
    const out = parseIntakeAiResult(JSON.stringify({ matters: [
      { label: 'นพ.ก', title: { value: 'นพ.ก', quote: 'นพ.ก', sourceMessageId: 'm1' }, summary: 'invented summary' },
      { label: 'นพ.ข', title: { value: 'นพ.ข', quote: 'นพ.ข', sourceMessageId: 'm1' } },
    ] }), messages);
    expect(out.map((p) => [p.field, p.value, p.matterLabel])).toEqual([['title', 'นพ.ก', 'นพ.ก'], ['title', 'นพ.ข', 'นพ.ข']]);
  });

  it('only classifies known files with valid categories and an exact unambiguous request name', () => {
    const doc = { documentId: 'd1', category: 'MEDICAL', docTypeLabel: 'เวชระเบียน', suggestedFilename: 'เวชระเบียน.pdf', docRequestName: 'เวชระเบียน' };
    const input = (documents: unknown[]) => JSON.stringify({ matters: [], documents });
    const sources = [{ id: 'd1', text: '', filename: 'scan.pdf' }];
    const out = parseIntakeAiResult(input([doc, { ...doc, documentId: 'unknown' }, { ...doc, category: 'unknown' }]), [], sources, [{ id: 'r1', name: 'เวชระเบียน' }]);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0].value)).toEqual({ documentId: 'd1', category: 'MEDICAL', filename: 'เวชระเบียน.pdf', docRequestId: 'r1', docTypeLabel: 'เวชระเบียน' });
    const unmatched = parseIntakeAiResult(input([{ ...doc, docRequestName: 'invented' }]), [], sources, [{ id: 'r1', name: 'เวชระเบียน' }]);
    expect(JSON.parse(unmatched[0].value).docRequestId).toBeNull();
  });

  it('requires every object property in the strict JSON schema', () => {
    const check = (schema: any) => {
      if (schema.type === 'object') {
        expect(schema.additionalProperties).toBe(false);
        expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
        Object.values(schema.properties).forEach(check);
      }
      if (schema.items) check(schema.items);
      if (schema.anyOf) schema.anyOf.forEach(check);
    };
    check(INTAKE_AI_RESPONSE_FORMAT.json_schema.schema);
  });

  it('returns nothing for malformed output', () => {
    expect(parseIntakeAiResult('not json', messages)).toEqual([]);
    expect(parseIntakeAiResult('{"matters":"x"}', messages)).toEqual([]);
    expect(parseIntakeAiResult('null', messages)).toEqual([]);
    expect(parseIntakeAiResult('{"matters":[null]}', messages)).toEqual([]);
  });
});

describe('extractFieldsFromEmailBody amounts', () => {
  it('creates labelled JSON other amounts, settlement proposals and Gregorian dates', () => {
    const fields = extractFieldsFromEmailBody('ค่ารักษาค้างชำระ 82,400 บาท\nข้อเสนอไกล่เกลี่ย 100,000 บาท\nตอบภายใน 31/10/2569');
    expect(fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'otherAmount', value: '{"label":"ค่ารักษาค้างชำระ","amount":82400}' }),
      expect.objectContaining({ field: 'settlementOfferAmount', value: '100000' }),
      expect.objectContaining({ field: 'requestedResponseDate', value: '2026-10-31T00:00:00.000Z' }),
    ]));
  });

  it('labels each amount by the words before it', () => {
    const fields = extractFieldsFromEmailBody(messages[0].text).filter((f) => f.field !== 'description');
    expect(fields.map((f) => [f.field, f.value])).toEqual([
      ['estimatedDamage', '1000000'],
      ['insurerPaidAmount', '300000'],
      ['estimatedDamage', '500000'],
    ]);
  });

  it('reads ungrouped amounts and does not reuse the previous amount context', () => {
    const fields = extractFieldsFromEmailBody('เรียกร้อง 1000000 บาท ประกันจ่าย 300000.50 บาท ข้อเสนอไกล่เกลี่ย 50000 บาท').filter((f) => f.field !== 'description');
    expect(fields.map((f) => [f.field, f.value])).toEqual([
      ['estimatedDamage', '1000000'], ['insurerPaidAmount', '300000.5'], ['settlementOfferAmount', '50000'],
    ]);
  });

  it('ignores amounts in the quoted history', () => {
    const body = 'ขอบคุณค่ะ\n\nFrom: Suchanya <s@x.com>\nSent: Tuesday\nเรียกร้อง 1,000,000 บาท';
    expect(extractFieldsFromEmailBody(body).map((f) => f.field)).toEqual(['description']);
  });
});

describe('rule-based amount labels use the nearest words', () => {
  it('an unpaid insurer followed by an outstanding bill is not insurer-paid', () => {
    const body = 'ผู้ป่วยเรียกร้อง 3,500,000 บาท ยังไม่มีการจ่ายจากประกัน ค่ารักษาพยาบาลค้างชำระ 82,400 บาท';
    const fields = extractFieldsFromEmailBody(body).filter((f) => f.field !== 'description');
    expect(fields.map((f) => f.field)).toEqual(['estimatedDamage', 'otherAmount']);
    expect(JSON.parse(fields[1].value)).toEqual({ label: 'ค่ารักษาพยาบาลค้างชำระ', amount: 82400 });
  });
});

describe('parseIntakeAiSummary', () => {
  it('keeps a bounded, cleaned summary and defaults an unknown urgency to NORMAL', () => {
    const raw = JSON.stringify({ matters: [], documents: [], summary: {
      overview: ['ข้อ 1', '  ', 'ข้อ 2', 'ข้อ 3', 'ข้อ 4', 'ข้อ 5', 'ข้อ 6', 'ข้อ 7'], clientRequest: 'ขอให้พิจารณาไกล่เกลี่ย',
      urgency: 'URGENT!!', urgencyReason: null, nextActions: ['ขอเวชระเบียน'], missingDocuments: ['เวชระเบียนฉบับเต็ม', 3],
    } });
    expect(parseIntakeAiSummary(raw)).toEqual({ overview: ['ข้อ 1', 'ข้อ 2', 'ข้อ 3', 'ข้อ 4', 'ข้อ 5', 'ข้อ 6'], clientRequest: 'ขอให้พิจารณาไกล่เกลี่ย',
      urgency: 'NORMAL', urgencyReason: null, nextActions: ['ขอเวชระเบียน'], missingDocuments: ['เวชระเบียนฉบับเต็ม'] });
    expect(parseIntakeAiSummary('nope')).toBeNull();
    const cited = JSON.stringify({ summary: { overview: ['ยอด 250,000 บาท (แหล่งอ้างอิง: 83e6b7d6-1cac-4320-b51c-0a9834a26d56)'], clientRequest: null, urgency: 'LOW', urgencyReason: null, nextActions: [], missingDocuments: [] } });
    expect(parseIntakeAiSummary(cited)?.overview).toEqual(['ยอด 250,000 บาท']);
    const leaked = JSON.stringify({ summary: { overview: [], clientRequest: null, urgency: 'LOW', urgencyReason: null, nextActions: ['ยืนยันผู้ว่าจ้างก่อนกำหนด partyRole หรือ caseType'], missingDocuments: [] } });
    const quoted = JSON.stringify({ summary: { overview: [], clientRequest: null, urgency: 'LOW', urgencyReason: null, nextActions: ['ตรวจสอบผล peer review (ข้อความต้นทาง: “Peer review 7. เอกสารประกอบ”; sourceMessageId: )'], missingDocuments: [] } });
    expect(parseIntakeAiSummary(quoted)?.nextActions).toEqual(['ตรวจสอบผล peer review']);
    const cutOff = JSON.stringify({ summary: { overview: ['ผ่าตัด LSG วันที่ 8 มีนาคม 2568 (ข้อความต้นทาง: “8 มีนาคม 2568 ... เวลา 19.30 นาฬิกา'], clientRequest: null, urgency: 'LOW', urgencyReason: null, nextActions: [], missingDocuments: [] } });
    expect(parseIntakeAiSummary(cutOff)?.overview).toEqual(['ผ่าตัด LSG วันที่ 8 มีนาคม 2568']);
    expect(parseIntakeAiSummary(leaked)?.nextActions).toEqual(['ยืนยันผู้ว่าจ้างก่อนกำหนด บทบาทลูกความ หรือ ประเภทคดี']);
  });
});

describe('extra fields need evidence and valid values', () => {
  const messages = [{ id: 'm', text: 'โรงพยาบาลถูกญาติผู้ป่วยเรียกร้องค่าเสียหาย คดีละเมิดทางการแพทย์' }];
  const ref = (value: string) => ({ value, quote: 'ถูกญาติผู้ป่วยเรียกร้อง', sourceMessageId: 'm', sourceDocumentId: null });
  it('keeps a known party role and case type, drops unknown ones', () => {
    const raw = (partyRole: string, caseType: string) => JSON.stringify({ matters: [{ label: 'x', partyRole: ref(partyRole), caseType: ref(caseType) }], documents: [] });
    expect(parseIntakeAiResult(raw('DEFENDANT', 'ละเมิดทางการแพทย์'), messages, [], [], ['ละเมิดทางการแพทย์']).map((p) => [p.field, p.value]))
      .toEqual([['partyRole', 'DEFENDANT'], ['caseType', 'ละเมิดทางการแพทย์']]);
    expect(parseIntakeAiResult(raw('จำเลย', 'คดีแพ่ง'), messages, [], [], ['ละเมิดทางการแพทย์'])).toEqual([]);
  });
});

