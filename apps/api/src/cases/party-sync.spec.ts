import { addOpponents, ensureOurClientParticipant } from './party-sync';

const fakeDb = () => ({
  case: { findUnique: jest.fn() },
  caseParticipant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn().mockImplementation(({ data }) => Promise.resolve({ count: data.length })),
  },
});

describe('ensureOurClientParticipant', () => {
  it('adds the client on our side with our role', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ partyRole: 'DEFENDANT', clientId: 'cl-1', clientName: null, client: { name: 'บริษัท ก จำกัด' } });

    await ensureOurClientParticipant(db as never, 'case-1');

    expect(db.caseParticipant.create).toHaveBeenCalledWith({
      data: { caseId: 'case-1', clientId: 'cl-1', name: 'บริษัท ก จำกัด', role: 'DEFENDANT', side: 'OURS' },
    });
  });

  it('is idempotent and corrects a stale role', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ partyRole: 'PLAINTIFF', clientId: 'cl-1', clientName: 'ก', client: { name: 'ก' } });
    db.caseParticipant.findFirst.mockResolvedValue({ id: 'p1', role: 'DEFENDANT', side: 'OURS' });

    await ensureOurClientParticipant(db as never, 'case-1');

    expect(db.caseParticipant.create).not.toHaveBeenCalled();
    expect(db.caseParticipant.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { role: 'PLAINTIFF', side: 'OURS' } });
  });

  it('does nothing without a party role or a client', async () => {
    const db = fakeDb();
    db.case.findUnique.mockResolvedValue({ partyRole: null, clientId: 'cl-1', clientName: 'ก', client: { name: 'ก' } });
    await ensureOurClientParticipant(db as never, 'case-1');
    db.case.findUnique.mockResolvedValue({ partyRole: 'PLAINTIFF', clientId: null, clientName: 'ก', client: null });
    await ensureOurClientParticipant(db as never, 'case-1');
    expect(db.caseParticipant.create).not.toHaveBeenCalled();
  });
});

describe('addOpponents', () => {
  it('puts opponents on the opposite role, skipping blanks and names already there', async () => {
    const db = fakeDb();
    db.caseParticipant.findMany.mockResolvedValue([{ name: 'นายเดิม' }]);

    const count = await addOpponents(db as never, 'case-1', 'PLAINTIFF', [
      { name: '  บริษัท ข จำกัด ', personType: 'นิติบุคคล' },
      { name: 'นายเดิม' },
      { name: ' ' },
      { name: 'ทนายฝั่งโน้น', role: 'OPPOSING_LAWYER' as never },
    ]);

    expect(count).toBe(2);
    expect(db.caseParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { caseId: 'case-1', name: 'บริษัท ข จำกัด', role: 'DEFENDANT', side: 'OPPONENT', personType: 'นิติบุคคล' },
        { caseId: 'case-1', name: 'ทนายฝั่งโน้น', role: 'OPPOSING_LAWYER', side: 'OPPONENT', personType: null },
      ],
    });
  });

  it('uses OTHER when our side is unknown', async () => {
    const db = fakeDb();
    await addOpponents(db as never, 'case-1', null, [{ name: 'นาย ค' }]);
    expect(db.caseParticipant.createMany.mock.calls[0][0].data[0].role).toBe('OTHER');
  });
});
