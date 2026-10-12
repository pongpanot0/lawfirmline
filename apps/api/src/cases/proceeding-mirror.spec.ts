import { CourtLevel } from '@lawfirm/shared';
import { ensureProceeding, mirrorProceeding, saveCaseNumbers, sortProceedings } from './proceeding-mirror';

const fakeDb = () => ({
  case: { findUnique: jest.fn(), update: jest.fn() },
  caseProceeding: {
    upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'p', ...create })),
    findUnique: jest.fn(),
  },
});

describe('proceeding mirror', () => {
  it('a new appeal proceeding is named after the court level', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtName: 'ศาลแพ่ง' });

    await ensureProceeding(db as never, 'case-1', CourtLevel.APPEAL);

    expect(db.caseProceeding.upsert).toHaveBeenCalledWith({
      where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'APPEAL' } },
      create: { caseId: 'case-1', courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์' },
      update: {},
    });
  });

  it('a new trial proceeding copies the case court', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtName: 'ศาลแพ่ง' });

    await ensureProceeding(db as never, 'case-1', CourtLevel.TRIAL);

    expect(db.caseProceeding.upsert.mock.calls[0][0].create.courtName).toBe('ศาลแพ่ง');
  });

  it('mirrors the proceeding at the case court level onto the case', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtLevel: 'APPEAL' });
    db.caseProceeding.findUnique.mockResolvedValue({
      courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'พ.123/2570', redCaseNumber: null,
    });

    await mirrorProceeding(db as never, 'case-1');

    expect(db.caseProceeding.findUnique).toHaveBeenCalledWith({
      where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'APPEAL' } },
    });
    expect(db.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'พ.123/2570', redCaseNumber: null },
    });
  });

  it('does not touch the case when the current level has no proceeding', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtLevel: null });
    db.caseProceeding.findUnique.mockResolvedValue(null);

    await mirrorProceeding(db as never, 'case-1');

    expect(db.case.update).not.toHaveBeenCalled();
  });

  it('saves edited numbers into that level’s proceeding, empty strings as null', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ courtName: 'ศาลแพ่ง' });

    await saveCaseNumbers(db as never, 'case-1', CourtLevel.TRIAL, { blackCaseNumber: 'พ.1/2569', redCaseNumber: '' });

    expect(db.caseProceeding.upsert).toHaveBeenCalledWith({
      where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'TRIAL' } },
      create: { caseId: 'case-1', courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569', redCaseNumber: null },
      update: { blackCaseNumber: 'พ.1/2569', redCaseNumber: null },
    });
  });

  it('sorts proceedings trial → appeal → supreme', () => {
    const rows = [{ courtLevel: 'SUPREME' }, { courtLevel: 'TRIAL' }, { courtLevel: 'APPEAL' }];

    expect(sortProceedings(rows).map((r) => r.courtLevel)).toEqual(['TRIAL', 'APPEAL', 'SUPREME']);
  });
});
