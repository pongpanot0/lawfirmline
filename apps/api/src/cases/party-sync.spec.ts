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

/** findFirst that honours its `where`, so the "auto-shaped row" filter is really exercised. */
const rowsDb = (legalCase: Record<string, unknown>, rows: Array<Record<string, unknown>>) => {
  const db = fakeDb();
  db.case.findUnique.mockResolvedValue(legalCase);
  db.caseParticipant.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null),
  );
  return db;
};
const clientB = { partyRole: 'PLAINTIFF', clientId: 'cl-b', clientName: null, client: { name: 'บริษัท บี' } };

describe('ensureOurClientParticipant on an edit (previous values given)', () => {
  it('moves the auto row to the new role when our side changes', async () => {
    const db = rowsDb({ ...clientB, partyRole: 'DEFENDANT' }, [{ id: 'p1', caseId: 'case-1', clientId: 'cl-b', role: 'PLAINTIFF', side: 'OURS' }]);
    await ensureOurClientParticipant(db as never, 'case-1', { clientId: 'cl-b', partyRole: 'PLAINTIFF' });
    expect(db.caseParticipant.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { role: 'DEFENDANT', side: 'OURS' } });
  });

  it('keeps a role the user set on purpose (JOINT_PLAINTIFF)', async () => {
    const db = rowsDb({ ...clientB, partyRole: 'DEFENDANT' }, [{ id: 'p1', caseId: 'case-1', clientId: 'cl-b', role: 'JOINT_PLAINTIFF', side: 'OURS' }]);
    await ensureOurClientParticipant(db as never, 'case-1', { clientId: 'cl-b', partyRole: 'PLAINTIFF' });
    expect(db.caseParticipant.update).not.toHaveBeenCalled();
    expect(db.caseParticipant.create).not.toHaveBeenCalled();
  });

  it('relinks the old client\'s auto row in place when the client changes A → B', async () => {
    const db = rowsDb(clientB, [{ id: 'pA', caseId: 'case-1', clientId: 'cl-a', role: 'PLAINTIFF', side: 'OURS' }]);
    await ensureOurClientParticipant(db as never, 'case-1', { clientId: 'cl-a', partyRole: 'PLAINTIFF' });
    expect(db.caseParticipant.update).toHaveBeenCalledWith({
      where: { id: 'pA' },
      data: { clientId: 'cl-b', name: 'บริษัท บี', role: 'PLAINTIFF', side: 'OURS' },
    });
    expect(db.caseParticipant.create).not.toHaveBeenCalled();
  });

  it('leaves a user-modified row of the old client alone and adds the new client', async () => {
    const db = rowsDb(clientB, [{ id: 'pA', caseId: 'case-1', clientId: 'cl-a', role: 'WITNESS', side: 'NEUTRAL' }]);
    await ensureOurClientParticipant(db as never, 'case-1', { clientId: 'cl-a', partyRole: 'PLAINTIFF' });
    expect(db.caseParticipant.update).not.toHaveBeenCalled();
    expect(db.caseParticipant.create).toHaveBeenCalledWith({
      data: { caseId: 'case-1', clientId: 'cl-b', name: 'บริษัท บี', role: 'PLAINTIFF', side: 'OURS' },
    });
  });

  it('clearing our side sets OTHER only on the auto row', async () => {
    const auto = rowsDb({ ...clientB, partyRole: null }, [{ id: 'p1', caseId: 'case-1', clientId: 'cl-b', role: 'PLAINTIFF', side: 'OURS' }]);
    await ensureOurClientParticipant(auto as never, 'case-1', { clientId: 'cl-b', partyRole: 'PLAINTIFF' });
    expect(auto.caseParticipant.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { role: 'OTHER' } });

    const kept = rowsDb({ ...clientB, partyRole: null }, [{ id: 'p1', caseId: 'case-1', clientId: 'cl-b', role: 'JOINT_PLAINTIFF', side: 'OURS' }]);
    await ensureOurClientParticipant(kept as never, 'case-1', { clientId: 'cl-b', partyRole: 'PLAINTIFF' });
    expect(kept.caseParticipant.update).not.toHaveBeenCalled();
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
