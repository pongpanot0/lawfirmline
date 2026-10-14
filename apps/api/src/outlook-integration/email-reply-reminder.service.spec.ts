import { EmailReplyReminderService } from './email-reply-reminder.service';

const H = 3600_000;
// Wednesday 2026-10-14 10:00 Bangkok
const NOW = new Date('2026-10-14T03:00:00Z');
const ago = (h: number) => new Date(NOW.getTime() - h * H);

describe('EmailReplyReminderService', () => {
  const prisma: any = {
    publicHoliday: { findUnique: jest.fn() },
    firm: { findMany: jest.fn() },
    emailThread: { findMany: jest.fn(), update: jest.fn() },
    emailMessage: { findMany: jest.fn() },
    firmMember: { findMany: jest.fn() },
    mailboxConnection: { findMany: jest.fn() },
    case: { findUnique: jest.fn() },
  };
  const notifier = { notifyAssigned: jest.fn() };
  const lineLink = { getCaseTeamUserIds: jest.fn() };
  let service: EmailReplyReminderService;

  const thread = (id: string, caseId: string, extra: any = {}) => ({
    id, caseId, subject: `S-${id}`, fromName: 'ลูกความ', fromAddress: 'c@x.com', replyDismissedAt: null, replyReminderMessageId: null, ...extra,
  });
  const msg = (id: string, threadId: string, direction: string, from: string, receivedAt: Date) => ({ id, threadId, direction, fromAddress: from, receivedAt });

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EmailReplyReminderService(prisma, notifier as any, lineLink as any);
    prisma.publicHoliday.findUnique.mockResolvedValue(null);
    prisma.firm.findMany.mockResolvedValue([{ id: 'f1', slaConfig: null }]);
    prisma.firmMember.findMany.mockResolvedValue([{ user: { email: 'Lawyer@Firm.com' } }]);
    prisma.mailboxConnection.findMany.mockResolvedValue([{ mailboxAddress: 'inbox@firm.com' }]);
    prisma.case.findUnique.mockResolvedValue({ ownRef: 'C-1' });
    lineLink.getCaseTeamUserIds.mockResolvedValue(['u1']);
    notifier.notifyAssigned.mockResolvedValue({});
  });

  const setup = (threads: any[], messages: any[]) => {
    prisma.emailThread.findMany.mockResolvedValue(threads);
    prisma.emailMessage.findMany.mockResolvedValue(messages);
  };

  it('reminds once for an overdue client email and records the message id', async () => {
    setup([thread('t1', 'c1')], [msg('m1', 't1', 'INBOUND', 'c@x.com', ago(30))]);
    await service.run(NOW);
    expect(notifier.notifyAssigned).toHaveBeenCalledTimes(1);
    const arg = notifier.notifyAssigned.mock.calls[0][0];
    expect(arg).toMatchObject({ userIds: ['u1'], actorUserId: '', entityPath: '/cases/c1?tab=email', appPath: '/case/c1?section=email' });
    expect(arg.summaryText).toContain('⏰ อีเมลลูกความรอตอบ · C-1');
    expect(arg.summaryText).toContain('(รอ 30 ชม.)');
    expect(prisma.emailThread.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { replyReminderMessageId: 'm1' } });
  });

  it('respects the threshold (default 24, firm override)', async () => {
    setup([thread('t1', 'c1')], [msg('m1', 't1', 'INBOUND', 'c@x.com', ago(10))]);
    await service.run(NOW);
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
    prisma.firm.findMany.mockResolvedValue([{ id: 'f1', slaConfig: { emailReplyHours: 8 } }]);
    await service.run(NOW);
    expect(notifier.notifyAssigned).toHaveBeenCalledTimes(1);
  });

  it('ignores internal senders (member email, connected mailbox) and answered threads', async () => {
    setup(
      [thread('t1', 'c1'), thread('t2', 'c1'), thread('t3', 'c1')],
      [msg('m1', 't1', 'INBOUND', 'lawyer@firm.com', ago(30)), msg('m2', 't2', 'INBOUND', 'INBOX@firm.com', ago(30)), msg('m3', 't3', 'OUTBOUND', 'lawyer@firm.com', ago(2))],
    );
    await service.run(NOW);
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('dismissed counts only until a newer inbound arrives', async () => {
    setup([thread('t1', 'c1', { replyDismissedAt: ago(40) })], [msg('m1', 't1', 'INBOUND', 'c@x.com', ago(30))]);
    await service.run(NOW);
    expect(notifier.notifyAssigned).toHaveBeenCalledTimes(1);
    notifier.notifyAssigned.mockClear();
    setup([thread('t1', 'c1', { replyDismissedAt: ago(20) })], [msg('m1', 't1', 'INBOUND', 'c@x.com', ago(30))]);
    await service.run(NOW);
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('does not remind twice for the same inbound message', async () => {
    setup([thread('t1', 'c1', { replyReminderMessageId: 'm1' })], [msg('m1', 't1', 'INBOUND', 'c@x.com', ago(30))]);
    await service.run(NOW);
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('skips weekends and public holidays', async () => {
    setup([thread('t1', 'c1')], [msg('m1', 't1', 'INBOUND', 'c@x.com', ago(30))]);
    await service.run(new Date('2026-10-17T03:00:00Z'));
    prisma.publicHoliday.findUnique.mockResolvedValue({ id: 'h' });
    await service.run(NOW);
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('groups threads per case into one alert capped at 3 lines', async () => {
    const ids = ['t1', 't2', 't3', 't4', 't5'];
    setup(ids.map((id) => thread(id, 'c1')), ids.map((id) => msg(`m-${id}`, id, 'INBOUND', 'c@x.com', ago(30))));
    await service.run(NOW);
    expect(notifier.notifyAssigned).toHaveBeenCalledTimes(1);
    expect(notifier.notifyAssigned.mock.calls[0][0].summaryText).toContain('และอีก 2 ฉบับ');
    expect(prisma.emailThread.update).toHaveBeenCalledTimes(5);
  });
});
