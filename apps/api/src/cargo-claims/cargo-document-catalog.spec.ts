import { CARGO_DOCUMENT_REQUIREMENTS } from '../../../../packages/shared/src/cargo-claim';

describe('CARGO_DOCUMENT_REQUIREMENTS', () => {
  it('defines the 16 stable cargo-claim document slots from the working checklist', () => {
    expect(CARGO_DOCUMENT_REQUIREMENTS).toHaveLength(16);
    expect(new Set(CARGO_DOCUMENT_REQUIREMENTS.map((item) => item.code)).size).toBe(16);
    expect(CARGO_DOCUMENT_REQUIREMENTS.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'INVOICE_PACKING_LIST',
        'CARRIAGE_DOCUMENT',
        'SURVEY_DAMAGE_EVIDENCE',
        'NOTICE_TO_CARRIER',
        'SUBROGATION_EVIDENCE',
        'DAMAGED_WEIGHT',
      ]),
    );
  });

  it('keeps case-dependent evidence conditional instead of blocking every cargo claim', () => {
    const byCode = new Map(CARGO_DOCUMENT_REQUIREMENTS.map((item) => [item.code, item]));
    expect(byCode.get('INVOICE_PACKING_LIST')?.requiredByDefault).toBe(true);
    expect(byCode.get('SURVEY_DAMAGE_EVIDENCE')?.requiredByDefault).toBe(true);
    expect(byCode.get('CERTIFICATE_OF_DESTRUCTION')?.requiredByDefault).toBe(false);
    expect(byCode.get('POLICE_DAILY_REPORT')?.requiredByDefault).toBe(false);
  });
});
