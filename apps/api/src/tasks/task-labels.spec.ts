import { normalizeTaskLabels } from '@lawfirm/shared';

describe('normalizeTaskLabels', () => {
  it('trims, drops blanks and de-duplicates', () => {
    expect(normalizeTaskLabels([' ศาล ', '', 'เอกสาร', 'ศาล'])).toEqual(['ศาล', 'เอกสาร']);
  });
  it('returns [] for non-arrays', () => {
    expect(normalizeTaskLabels(undefined)).toEqual([]);
    expect(normalizeTaskLabels('x')).toEqual([]);
  });
  it('rejects more than 10 labels', () => {
    const many = Array.from({ length: 11 }, (_, i) => `l${i}`);
    expect(() => normalizeTaskLabels(many)).toThrow('TASK_LABELS_TOO_MANY');
  });
  it('rejects a label over 30 chars', () => {
    expect(() => normalizeTaskLabels(['a'.repeat(31)])).toThrow('TASK_LABEL_TOO_LONG');
  });
});
