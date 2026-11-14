import { missingCaseInfo } from './case-info';

const legalCase = {
  stage: 'PRE_LITIGATION', partyRole: 'PLAINTIFF', courtName: null,
  chargeSection: ' ข้อหา ', customFields: { claim: ' เรียกเงิน ' },
  participants: [{ name: 'จำเลย', side: 'OPPONENT', role: 'DEFENDANT' }],
};
const schema = [
  { key: 'chargeSection', label: 'ข้อหา', required: true },
  { key: 'claim', label: 'คำขอ', required: true },
  { key: 'opposingParty', label: 'คู่ความฝ่ายตรงข้าม', required: true },
  { key: 'optional', label: 'ไม่บังคับ' },
];

describe('missingCaseInfo', () => {
  it('returns missing custom-field labels in schema order and trims values', () => {
    expect(missingCaseInfo({ ...legalCase, customFields: { claim: '  ' } }, schema)).toEqual(['คำขอ']);
    expect(missingCaseInfo({ ...legalCase, customFields: null }, schema)).toEqual(['คำขอ']);
  });
  it('reads chargeSection from the case rather than customFields', () => {
    expect(missingCaseInfo({ ...legalCase, chargeSection: ' ', customFields: { claim: 'ครบ', chargeSection: 'ไม่ใช้' } }, schema)).toEqual(['ข้อหา']);
  });
  it('accepts any named opponent participant, regardless of participant role', () => {
    expect(missingCaseInfo({ ...legalCase, participants: [{ name: 'คู่ความ', side: 'OPPONENT', role: 'OTHER' }] }, schema)).toEqual([]);
    expect(missingCaseInfo({ ...legalCase, participants: [{ name: '  ', side: 'OPPONENT', role: 'DEFENDANT' }] }, schema)).toEqual(['คู่ความฝ่ายตรงข้าม']);
  });
  it.each(['OURS', 'NEUTRAL'])('does not count an explicit %s participant as an opponent', (side) => {
    expect(missingCaseInfo({ ...legalCase, participants: [{ name: 'ชื่อ', side, role: 'DEFENDANT' }] }, schema)).toEqual(['คู่ความฝ่ายตรงข้าม']);
  });
  it.each([
    ['PLAINTIFF', 'DEFENDANT'], ['DEFENDANT', 'PLAINTIFF'],
    ['PETITIONER', 'RESPONDENT'], ['RESPONDENT', 'PETITIONER'],
  ])('uses partySide for legacy participants without side: %s versus %s', (partyRole, role) => {
    expect(missingCaseInfo({ ...legalCase, partyRole, participants: [{ name: 'คู่ความ', role }] }, schema)).toEqual([]);
  });
  it('does not infer an opponent from neutral or unknown legacy roles', () => {
    expect(missingCaseInfo({ ...legalCase, participants: [{ name: 'พยาน', role: 'WITNESS' }] }, schema)).toEqual(['คู่ความฝ่ายตรงข้าม']);
  });
  it.each(['PRE_LITIGATION', 'INTAKE_REVIEW', 'FACT_GATHERING'])('does not require a court during %s', (stage) => {
    expect(missingCaseInfo({ ...legalCase, stage }, schema)).toEqual([]);
  });
  it.each(['FILING', 'HEARING', 'APPEAL', 'CLOSING'])('requires a court during %s', (stage) => {
    expect(missingCaseInfo({ ...legalCase, stage, courtName: ' ' }, schema)).toEqual(['ศาล']);
  });
  it('is complete without a black case number when the court and required fields are filled', () => {
    expect(missingCaseInfo({ ...legalCase, stage: 'FILING', courtName: ' ศาลแพ่ง ' }, schema)).toEqual([]);
  });
  it('tolerates absent or malformed JSON and treats non-string field values as missing', () => {
    expect(missingCaseInfo(legalCase, null)).toEqual([]);
    expect(missingCaseInfo(legalCase, {})).toEqual([]);
    expect(missingCaseInfo({ ...legalCase, customFields: { claim: 5 } }, [null, {}, ...schema])).toEqual(['คำขอ']);
  });
});


describe('required custom field definitions', () => {
  const definition = { key: 'cf_required', label: 'Required amount', required: true, caseTypeIds: [], archivedAt: null, visibility: 'FIRM' as const, entityKind: 'CASE' as const, type: 'NUMBER' as const };
  const record = { ...legalCase, caseTypeId: 'civil' };
  it.each([['NUMBER', 0], ['BOOLEAN', false]] as const)('%s value %p counts as filled', (type, value) => {
    expect(missingCaseInfo({ ...record, customFields: { cf_required: value } }, [], [{ ...definition, type }])).toEqual([]);
  });
  it.each([null, undefined, '', '  '])('empty value %p blocks the stage with the field label', value => {
    expect(missingCaseInfo({ ...record, customFields: { cf_required: value } }, [], [definition])).toEqual(['Required amount']);
  });
  it.each([
    { archivedAt: '2026-11-01' }, { caseTypeIds: ['criminal'] }, { visibility: 'PERSONAL' as const },
    { entityKind: 'CLIENT' as const }, { required: false },
  ])('ignores a definition outside required active firm CASE scope: %p', overrides => {
    expect(missingCaseInfo(record, [], [{ ...definition, ...overrides }])).toEqual([]);
  });
  it('requires matching case types and preserves legacy missing labels', () => {
    expect(missingCaseInfo({ ...record, chargeSection: null, customFields: {} }, schema, [{ ...definition, caseTypeIds: ['civil'] }])).toEqual(['ข้อหา', 'คำขอ', 'Required amount']);
    expect(missingCaseInfo({ ...record, caseTypeId: null }, [], [{ ...definition, caseTypeIds: ['civil'] }])).toEqual([]);
  });
});
