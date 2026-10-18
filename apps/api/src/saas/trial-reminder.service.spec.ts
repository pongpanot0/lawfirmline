import { dueReminder, TrialReminderService } from './trial-reminder.service';

const DAY = 24 * 60 * 60 * 1000;

describe('dueReminder', () => {
  it.each([
    [10, null],
    [8, null],
    [7, 7],
    [3, 7],
    [1, 1],
    [0, 0],
  ])('%i days left → %s', (days, expected) => {
    expect(dueReminder(days)).toBe(expected);
  });
});

describe('TrialReminderService.run', () => {
  const now = new Date('2026-10-18T02:00:00Z');
  const prisma = {
    firm: { findMany: jest.fn(), updateMany: jest.fn() },
    firmMember: { findMany: jest.fn() },
  };
  const email = { getAppUrl: () => 'https://samnuan.com', sendTrialReminderEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new TrialReminderService(prisma as any, email as any);
  const firm = (daysLeft: number, sent: number | null) => ({
    id: 'f1',
    name: 'Firm',
    trialEndAt: new Date(now.getTime() + daysLeft * DAY),
    currentPeriodEnd: null as Date | null,
    trialReminderSentDays: sent,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.firm.updateMany.mockResolvedValue({ count: 1 });
    prisma.firmMember.findMany.mockResolvedValue([{ user: { email: 'owner@x.com' } }]);
  });

  it('emails every owner the due reminder with the web billing link', async () => {
    prisma.firm.findMany.mockResolvedValue([firm(7, null)]);
    await service.run(now);
    expect(prisma.firm.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { trialReminderSentDays: 7 } }));
    expect(email.sendTrialReminderEmail).toHaveBeenCalledWith({ to: 'owner@x.com', firmName: 'Firm', daysLeft: 7, billingUrl: 'https://samnuan.com/account/billing', prepaid: false });
  });

  it('skips a reminder already sent', async () => {
    prisma.firm.findMany.mockResolvedValue([firm(5, 7)]);
    await service.run(now);
    expect(prisma.firm.updateMany).not.toHaveBeenCalled();
    expect(email.sendTrialReminderEmail).not.toHaveBeenCalled();
  });

  it('moves on to the next reminder once it is due', async () => {
    prisma.firm.findMany.mockResolvedValue([firm(0, 1)]);
    await service.run(now);
    expect(email.sendTrialReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ daysLeft: 0 }));
  });

  it('a prepaid (PromptPay) period ending gets the renewal wording, timed off its period end', async () => {
    prisma.firm.findMany.mockResolvedValue([{ ...firm(30, null), currentPeriodEnd: new Date(now.getTime() + 1 * DAY) }]);
    await service.run(now);
    expect(email.sendTrialReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ daysLeft: 1, prepaid: true }));
  });

  it('only queries firms without a card subscription', async () => {
    prisma.firm.findMany.mockResolvedValue([]);
    await service.run(now);
    expect(prisma.firm.findMany.mock.calls[0][0].where.stripeSubscriptionId).toBeNull();
  });

  it('does not email when another run already claimed it', async () => {
    prisma.firm.findMany.mockResolvedValue([firm(1, 7)]);
    prisma.firm.updateMany.mockResolvedValue({ count: 0 });
    await service.run(now);
    expect(email.sendTrialReminderEmail).not.toHaveBeenCalled();
  });
});
