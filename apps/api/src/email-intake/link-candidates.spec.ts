import { CaseEmailService } from './case-email.service';
import { CaseEmailController } from './case-email.controller';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

const user = { id: 'member', firmId: 'firm' } as any;
const thread = (id: string, patch: Record<string, unknown> = {}) => ({
  id, subject: 'คำถาม', fromName: 'ลูกความ', fromAddress: 'client@test.com', lastMessageAt: new Date('2026-11-10'),
  caseId: null, case: null, mailboxConnection: { mailboxAddress: 'lawyer@firm.com' },
  messages: [{ fromAddress: 'client@test.com', toAddresses: ['lawyer@firm.com'], ccAddresses: [], _count: { attachments: 2 } }], ...patch,
});

describe('inverse email linking', () => {
  const prisma = { case: { findFirst: jest.fn() }, client: { findFirst: jest.fn() }, emailThread: { findMany: jest.fn() }, auditLog: { findMany: jest.fn() },
    firmMember: { findMany: jest.fn() }, mailboxConnection: { findMany: jest.fn() }, $queryRaw: jest.fn() };
  const access = { getCaseFilterForUser: jest.fn(), getEmailThreadFilterForUser: jest.fn() };
  let service: CaseEmailService;
  beforeEach(() => {
    jest.resetAllMocks();
    access.getCaseFilterForUser.mockReturnValue({ firmId: 'firm', deletedAt: null });
    access.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'firm', visible: true });
    prisma.case.findFirst.mockResolvedValue({ id: 'case', ownRef: 'REF-1234', customerRef: 'CUSTOMER-1234', blackCaseNumber: 'พ.1/2569', intake: { claimNumber: 'CLAIM-1234', policyNumber: 'POLICY-1234' },
      client: { billingEmail: 'billing@test.com', contacts: [{ email: 'client@test.com' }] }, participants: [{ email: 'participant@test.com' }], emailThreads: [{ subject: 'Claim THREAD-1234' }],
    });
    prisma.client.findFirst.mockResolvedValue({ billingEmail: 'billing@test.com', contacts: [{ email: 'client@test.com' }] });
    prisma.emailThread.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.firmMember.findMany.mockResolvedValue([]);
    prisma.mailboxConnection.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    service = new CaseEmailService(prisma as any, access as any, {} as any, {} as any, {} as any, {} as any);
  });
  it('matches case refs, contacts and participants, separates linked elsewhere and excludes this case', async () => {
    const rows = [thread('ref', { subject: 'RE: THREAD-1234', fromAddress: 'other@test.com', messages: [] }),
      thread('contact'), thread('participant', { fromAddress: 'participant@test.com', messages: [] }),
      thread('elsewhere', { caseId: 'other', case: { id: 'other', ownRef: 'OTHER', title: 'คดีอื่น' } }),
      thread('already', { caseId: 'case', case: { id: 'case' } }), thread('unmatched', { fromAddress: 'other@test.com', messages: [] })];
    prisma.emailThread.findMany.mockImplementation(async ({ where }) => JSON.stringify(where).includes('"caseId":null') ? rows.filter((r) => !r.caseId) : rows.filter((r) => r.caseId));
    const result = await (service as any).linkCandidates(user, { caseId: 'case' });
    expect(result.suggested.map((t: any) => t.threadId)).toEqual(['ref', 'contact', 'participant']);
    expect(result.suggested[0].reasons).toEqual(['SAME_REFERENCE']);
    expect(result.suggested[1]).toMatchObject({ attachmentCount: 2, reasons: ['CONTACT_EMAIL'], linkedCase: null });
    expect(result.linkedElsewhere).toHaveLength(1);
    expect(result.linkedElsewhere[0]).toMatchObject({ threadId: 'elsewhere', linkedCase: { id: 'other', ownRef: 'OTHER', title: 'คดีอื่น' } });
    for (const [query] of prisma.emailThread.findMany.mock.calls) {
      expect(query.where.AND).toContainEqual({ firmId: 'firm', visible: true });
      expect(query.take).toBeLessThanOrEqual(200);
      expect(query.orderBy[0]).toEqual({ lastMessageAt: 'desc' });
    }
  });
  it.each(['REF-1234', 'CUSTOMER-1234', 'พ.1/2569', 'CLAIM-1234', 'POLICY-1234'])('matches %s as SAME_REFERENCE', async (ref) => {
    prisma.emailThread.findMany.mockResolvedValueOnce([thread('ref', { subject: `RE: ${ref}`, fromAddress: 'other@test.com', messages: [] })]).mockResolvedValueOnce([]);
    expect((await (service as any).linkCandidates(user, { caseId: 'case' })).suggested[0].reasons).toEqual(['SAME_REFERENCE']);
  });
  it('uses only client emails without a case and validates tenancy', async () => {
    prisma.emailThread.findMany.mockResolvedValueOnce([thread('client'), thread('ref', { subject: 'REF-1234', fromAddress: 'other@test.com', messages: [] })]).mockResolvedValueOnce([]);
    const result = await (service as any).linkCandidates(user, { clientId: 'client' });
    expect(result.suggested.map((r: any) => r.threadId)).toEqual(['client']);
    expect(prisma.client.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'client', firmId: 'firm' } }));
    prisma.client.findFirst.mockResolvedValue(null);
    await expect((service as any).linkCandidates(user, { clientId: 'foreign' })).rejects.toMatchObject({ status: 400 });
  });
  it('adds trimmed, case-insensitive q matches without reasons, bounded to 30 per list', async () => {
    prisma.emailThread.findMany.mockResolvedValueOnce(Array.from({ length: 40 }, (_, i) => thread(`q${i}`, { subject: 'ค้น NEEDLE', fromAddress: 'other@test.com', messages: [] }))).mockResolvedValueOnce([]);
    const result = await (service as any).linkCandidates(user, { q: '  needle  ' });
    expect(result.suggested).toHaveLength(30);
    expect(result.suggested[0].reasons).toEqual([]);
    expect(prisma.emailThread.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ OR: expect.arrayContaining([{ subject: { contains: 'needle', mode: 'insensitive' } }]) })]) }));
    prisma.emailThread.findMany.mockClear();
    expect(await (service as any).linkCandidates(user, { q: ' a ' })).toEqual({ suggested: [], linkedElsewhere: [] });
    expect(prisma.emailThread.findMany).not.toHaveBeenCalled();
  });
  it('404s a case outside the access filter', async () => {
    prisma.case.findFirst.mockResolvedValue(null);
    await expect((service as any).linkCandidates(user, { caseId: 'hidden' })).rejects.toMatchObject({ status: 404 });
    expect(prisma.emailThread.findMany).not.toHaveBeenCalled();
  });
  it('attributes thread links from latest matching audits with a single batch query', async () => {
    prisma.emailThread.findMany.mockResolvedValue([thread('first'), thread('second')]);
    prisma.auditLog.findMany.mockResolvedValue([
      { metadata: { threadId: 'first' }, user: { firstName: 'ใหม่', lastName: 'คน' } },
      { metadata: { threadId: 'first' }, user: { firstName: 'เก่า', lastName: 'คน' } },
    ]);
    const rows = await service.listCaseThreads(user, 'case');
    expect(rows[0]).toMatchObject({ linkedBy: { firstName: 'ใหม่', lastName: 'คน' } });
    expect(rows[1]).toMatchObject({ linkedBy: null });
    expect(prisma.auditLog.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ firmId: 'firm', action: 'EMAIL_THREAD_LINKED', AND: expect.arrayContaining([{ metadata: { path: ['caseId'], equals: 'case' } }]) }), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
  });
  it('guards the case candidate route and forwards both form/case queries', () => {
    const mock = { linkCandidates: jest.fn() };
    const controller = new CaseEmailController(mock as any, {} as any, {} as any) as any;
    expect(typeof controller.caseLinkCandidates).toBe('function');
    controller.caseLinkCandidates(user, 'case', 'query');
    controller.linkCandidates(user, 'client', 'query');
    expect(mock.linkCandidates.mock.calls).toEqual([[user, { caseId: 'case', q: 'query' }], [user, { clientId: 'client', q: 'query' }]]);
    expect(Reflect.getMetadata('__guards__', controller.caseLinkCandidates)).toContain(CaseAccessGuard);
  });
});
