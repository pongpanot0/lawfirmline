import { Test } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { PrismaService } from '../prisma/prisma.module';
import { dailyTaskScope, DailyOperationsService } from './daily-operations.service';
import { TeamDigestScheduler } from './team-digest.scheduler';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { EmailService } from '../notifications/email.service';
import { PushService } from '../notifications/push.service';

const member = (id = 'u1', lineUserId: string | null = 'L1', firmId = 'f1') => ({
  firmId, firm: { name: `Firm ${firmId}` }, user: { id, email: `${id}@example.com`, lineUserId },
});

describe('TeamDigestScheduler', () => {
  let scheduler: TeamDigestScheduler;
  const prisma = { taskComment: { findMany: jest.fn() }, firmMember: { findMany: jest.fn() }, dailyDigestLog: { findMany: jest.fn(), create: jest.fn() } };
  const operations = { board: jest.fn(), radar: jest.fn() };
  const line = { sendText: jest.fn() };
  const email = { sendTeamDigestEmail: jest.fn(), getAppUrl: jest.fn() };
  const push = { sendToUsers: jest.fn() };
  let recipients: ReturnType<typeof member>[];

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T01:30:00Z'));
    recipients = [member()];
    prisma.firmMember.findMany.mockImplementation(async query => query.select.userId
      ? [{ userId: 'u1', createdAt: new Date('2026-11-04T00:00:00Z') }] : recipients);
    prisma.dailyDigestLog.findMany.mockResolvedValue([]);
    prisma.taskComment.findMany.mockResolvedValue([]);
    prisma.dailyDigestLog.create.mockResolvedValue({});
    operations.board.mockResolvedValue({ members: [{ userId: 'u1', firstName: 'สมชาย', lastName: 'ใจดี', role: 'LAWYER', onLeave: false }], tasks: [] });
    operations.radar.mockResolvedValue({ members: [] });
    line.sendText.mockResolvedValue(true);
    email.sendTeamDigestEmail.mockResolvedValue(true);
    email.getAppUrl.mockReturnValue('https://app.example');
    push.sendToUsers.mockResolvedValue(true);
    const module = await Test.createTestingModule({ providers: [TeamDigestScheduler,
      { provide: PrismaService, useValue: prisma }, { provide: DailyOperationsService, useValue: operations },
      { provide: LineMessagingService, useValue: line }, { provide: EmailService, useValue: email }, { provide: PushService, useValue: push },
    ] }).compile();
    scheduler = module.get(TeamDigestScheduler);
  });
  afterEach(() => jest.useRealTimers());

  it('runs weekdays at 08:30 Bangkok', () => {
    expect(Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, scheduler.sendDigests)).toMatchObject({ cronTime: '30 8 * * 1-5', timeZone: 'Asia/Bangkok' });
  });

  it('queries only enabled owners, managers and senior lawyers; reuses board/radar once per firm', async () => {
    recipients.push(member('u2', null));
    await scheduler.sendDigests();
    expect(prisma.firmMember.findMany.mock.calls[0][0].where).toEqual({
      role: { in: [FirmRole.OWNER, FirmRole.OFFICE_MANAGER, FirmRole.SENIOR_LAWYER] }, user: { dailyDigestEnabled: true },
    });
    expect(operations.board).toHaveBeenCalledTimes(1);
    expect(operations.radar).toHaveBeenCalledTimes(1);
    expect(operations.board).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER }), '2026-11-09');
    expect(prisma.taskComment.findMany).toHaveBeenCalledWith({
      where: { kind: 'DAILY_UPDATE',
        createdAt: { gte: new Date('2026-11-05T17:00:00Z'), lt: new Date('2026-11-06T17:00:00Z') },
        authorId: { in: ['u1'] }, task: dailyTaskScope('f1') },
      select: { authorId: true, body: true, createdAt: true, task: { select: { case: { select: { ownRef: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    expect(prisma.firmMember.findMany.mock.calls[1][0]).toEqual({
      where: { firmId: 'f1', userId: { in: ['u1'] } }, select: { userId: true, createdAt: true },
    });
  });

  it('chooses LINE when linked, otherwise email, and sends one short team push', async () => {
    recipients.push(member('u2', null));
    await scheduler.sendDigests();
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('🆕 สมชาย ใจดี (เข้าใหม่ 5 วัน)'), ['L1']);
    expect(email.sendTeamDigestEmail).toHaveBeenCalledWith({ to: 'u2@example.com', dayLabel: 'จ. 9 พ.ย. 2569',
      lines: expect.arrayContaining(['ดูรายละเอียดในแอป: https://app.example/operations']) });
    expect(push.sendToUsers).toHaveBeenCalledWith(['u1'], { title: '📋 สรุปทีมวันนี้ · Firm f1',
      body: 'เกินเกณฑ์ 0 คน · เลยกำหนด 0 งาน · ไม่ได้อัปเดต 0 คน · คนใหม่ 1 คน', data: { url: '/(tabs)/team' } });
    for (const channel of ['team-line:f1', 'team-email:f1', 'team-push:f1']) {
      expect(prisma.dailyDigestLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ channel,
        digestDate: new Date('2026-11-09T00:00:00Z') }) });
    }
  });

  it('skips all sends and board queries when both channels were logged', async () => {
    prisma.dailyDigestLog.findMany.mockResolvedValue([{ userId: 'u1', channel: 'team-email:f1' }, { userId: 'u1', channel: 'team-push:f1' }]);
    await scheduler.sendDigests();
    expect(operations.board).not.toHaveBeenCalled();
    expect(line.sendText).not.toHaveBeenCalled();
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  it('does not email after LINE was logged and still pushes', async () => {
    recipients = [member('u1', null)];
    prisma.dailyDigestLog.findMany.mockResolvedValue([{ userId: 'u1', channel: 'team-line:f1' }]);
    await scheduler.sendDigests();
    expect(email.sendTeamDigestEmail).not.toHaveBeenCalled();
    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
  });

  it('ignores ordinary digest logs and skips an already logged team push', async () => {
    prisma.dailyDigestLog.findMany.mockResolvedValue([{ userId: 'u1', channel: 'line' }, { userId: 'u1', channel: 'team-push:f1' }]);
    await scheduler.sendDigests();
    expect(line.sendText).toHaveBeenCalledTimes(1);
    expect(push.sendToUsers).not.toHaveBeenCalled();
  });

  it('counts a completed-later task comment without loading the previous board', async () => {
    operations.board.mockResolvedValue({ members: [{ userId: 'u1', firstName: 'สมชาย', lastName: 'ใจดี', role: 'LAWYER', onLeave: false }],
      tasks: [{ assigneeId: 'u1', status: 'DONE', blocker: null, holdReason: null, blockedBy: null, case: null }] });
    prisma.taskComment.findMany.mockResolvedValue([{ authorId: 'u1', body: 'ทำถึงไหน: ส่งเอกสาร\nเหลืออะไร: รอรับ\nติดอะไร: ไม่มี',
      createdAt: new Date('2026-11-06T10:00:00Z'), task: { case: null } }]);
    await scheduler.sendDigests();
    expect(operations.board).toHaveBeenCalledTimes(1);
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('✅ ส่งเอกสาร'), ['L1']);
  });

  it('sends both text and push to the same user in two firms', async () => {
    recipients.push(member('u1', 'L1', 'f2'));
    await scheduler.sendDigests();
    expect(line.sendText).toHaveBeenCalledTimes(2);
    expect(push.sendToUsers).toHaveBeenCalledTimes(2);
    for (const firmId of ['f1', 'f2']) {
      expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining(`📋 สรุปทีมประจำวัน Firm ${firmId}`), ['L1']);
      expect(push.sendToUsers).toHaveBeenCalledWith(['u1'], expect.objectContaining({ title: `📋 สรุปทีมวันนี้ · Firm ${firmId}` }));
      for (const channel of ['team-line', 'team-push']) {
        expect(prisma.dailyDigestLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', channel: `${channel}:${firmId}` }) });
      }
    }
    expect(prisma.dailyDigestLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      channel: { in: ['team-line:f1', 'team-email:f1', 'team-push:f1', 'team-line:f2', 'team-email:f2', 'team-push:f2'] },
    }) }));
  });

  it('logs for the first firm do not suppress another firm for the same user', async () => {
    recipients.push(member('u1', 'L1', 'f2'));
    prisma.dailyDigestLog.findMany.mockResolvedValue([{ userId: 'u1', channel: 'team-email:f1' }, { userId: 'u1', channel: 'team-push:f1' }]);
    await scheduler.sendDigests();
    expect(operations.board).toHaveBeenCalledTimes(1);
    expect(operations.board).toHaveBeenCalledWith(expect.objectContaining({ firmId: 'f2' }), '2026-11-09');
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('Firm f2'), ['L1']);
    expect(push.sendToUsers).toHaveBeenCalledTimes(1);
  });

  it('does not log when any sender returns false', async () => {
    recipients.push(member('u2', null));
    line.sendText.mockResolvedValue(false);
    email.sendTeamDigestEmail.mockResolvedValue(false);
    push.sendToUsers.mockResolvedValue(false);
    await scheduler.sendDigests();
    expect(prisma.dailyDigestLog.create).not.toHaveBeenCalled();
  });

  it('keeps pushing and sending to the next recipient when text throws', async () => {
    recipients.push(member('u2', 'L2'));
    line.sendText.mockRejectedValueOnce(new Error('bad LINE'));
    await scheduler.sendDigests();
    expect(line.sendText).toHaveBeenCalledTimes(2);
    expect(push.sendToUsers).toHaveBeenCalledTimes(2);
    expect(prisma.dailyDigestLog.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u1', channel: 'team-line:f1' }) });
    expect(prisma.dailyDigestLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u2', channel: 'team-line:f1' }) });
  });

  it('continues to other firms when one firm fails', async () => {
    recipients.push(member('u2', 'L2', 'f2'));
    operations.board.mockRejectedValueOnce(new Error('bad firm'));
    await scheduler.sendDigests();
    expect(line.sendText).toHaveBeenCalledTimes(1);
    expect(line.sendText.mock.calls[0][1]).toEqual(['L2']);
  });

  it('handles an empty recipient list without loading anything', async () => {
    recipients = [];
    await scheduler.sendDigests();
    expect(prisma.dailyDigestLog.findMany).not.toHaveBeenCalled();
    expect(operations.board).not.toHaveBeenCalled();
  });
});
