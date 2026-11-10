import { syncConfirmedToCase } from './email-intake.service';

function tx() {
  return {
    case: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ partyRole: 'DEFENDANT', clientId: 'client-1', clientName: null, client: { name: 'บมจ. ธนบุรี' } }) },
    caseParticipant: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), createMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn(), update: jest.fn() },
  };
}
const legalCase = { id: 'case-1', partyRole: null, clientId: 'client-1' };

describe('syncConfirmedToCase — what the lawyer confirms after the case opened lands on the case', () => {
  it('files the court number as the black case number', async () => {
    const db = tx();
    await syncConfirmedToCase(db as any, legalCase, { externalCaseNumber: 'คดี ผบ. 181/2569' });
    expect(db.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { blackCaseNumber: 'ผบ.181/2569' } });
  });

  it('records our side and adds the other party as plaintiff when we defend', async () => {
    const db = tx();
    await syncConfirmedToCase(db as any, legalCase, { partyRole: 'DEFENDANT' });
    expect(db.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { partyRole: 'DEFENDANT' } });
    await syncConfirmedToCase(db as any, { ...legalCase, partyRole: 'DEFENDANT' }, { opposingParty: 'นายรอยบุญ เลาหะวิไลย' });
    expect(db.caseParticipant.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ caseId: 'case-1', name: 'นายรอยบุญ เลาหะวิไลย', side: 'OPPONENT', role: 'PLAINTIFF' })] });
  });

  it('moves opponents filed under the old side when our side changes', async () => {
    const db = tx();
    await syncConfirmedToCase(db as any, { ...legalCase, partyRole: 'PLAINTIFF' }, { partyRole: 'DEFENDANT' });
    expect(db.caseParticipant.updateMany).toHaveBeenCalledWith({ where: { caseId: 'case-1', side: 'OPPONENT', role: 'DEFENDANT' }, data: { role: 'PLAINTIFF' } });
  });
});
