import { Test } from '@nestjs/testing';
import { CaseEmailNotifier, NewInboundBatch, trackNewInbound } from './case-email-notifier.service';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { LineLinkService } from '../notifications/line-link.service';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const msg = (receivedDateTime: string) => ({ subject: 'S', receivedDateTime, from: { emailAddress: { name: 'A', address: 'a@x.com' } } }) as any;

describe('trackNewInbound', () => {
  const run = (result: any, dir: 'INBOUND' | 'OUTBOUND', received: string) => {
    const batch: NewInboundBatch = new Map();
    trackNewInbound(batch, result, dir, msg(received), NOW);
    return batch;
  };
  it('collects a fresh created inbound message under its case', () => {
    expect(run({ created: true, caseId: 'c1' }, 'INBOUND', '2026-10-14T11:00:00Z').get('c1')).toEqual([{ fromName: 'A', fromAddress: 'a@x.com', subject: 'S' }]);
  });
  it('ignores existing, case-less, outbound and >24h-old mail', () => {
    expect(run({ created: false, caseId: 'c1' }, 'INBOUND', '2026-10-14T11:00:00Z').size).toBe(0);
    expect(run({ created: true, caseId: null }, 'INBOUND', '2026-10-14T11:00:00Z').size).toBe(0);
    expect(run({ created: true, caseId: 'c1' }, 'OUTBOUND', '2026-10-14T11:00:00Z').size).toBe(0);
    expect(run({ created: true, caseId: 'c1' }, 'INBOUND', '2026-10-13T11:00:00Z').size).toBe(0);
    expect(run(null, 'INBOUND', '2026-10-14T11:00:00Z').size).toBe(0);
  });
});

describe('CaseEmailNotifier', () => {
  let svc: CaseEmailNotifier;
  const prisma = { case: { findUnique: jest.fn() } };
  const notifier = { notifyAssigned: jest.fn() };
  const lineLink = { getCaseTeamUserIds: jest.fn() };
  const item = (n: number) => ({ fromName: n === 1 ? null : `P${n}`, fromAddress: `p${n}@x.com`, subject: `S${n}` });

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.case.findUnique.mockResolvedValue({ firmId: 'f1', ownRef: 'REF-1' });
    lineLink.getCaseTeamUserIds.mockResolvedValue(['owner', 'u2']);
    notifier.notifyAssigned.mockResolvedValue({});
    const m = await Test.createTestingModule({
      providers: [
        CaseEmailNotifier,
        { provide: PrismaService, useValue: prisma },
        { provide: AssignmentNotifierService, useValue: notifier },
        { provide: LineLinkService, useValue: lineLink },
      ],
    }).compile();
    svc = m.get(CaseEmailNotifier);
  });

  it('sends one EMAIL notification per case, minus the mailbox owner, listing 3 then the remainder', async () => {
    await svc.notifyBatch(new Map([['c1', [1, 2, 3, 4, 5].map(item)], ['c2', [item(1)]]]), 'owner');
    expect(notifier.notifyAssigned).toHaveBeenCalledTimes(2);
    expect(notifier.notifyAssigned.mock.calls[0][0]).toEqual({
      firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'EMAIL',
      summaryText: '📧 อีเมลใหม่ 5 ฉบับ · REF-1\np1@x.com: S1\nP2: S2\nP3: S3\nและอีก 2 ฉบับ',
      entityPath: '/cases/c1?tab=email',
      appPath: '/case/c1?section=email',
    });
  });

  it('swallows notifier failures', async () => {
    notifier.notifyAssigned.mockRejectedValue(new Error('boom'));
    await expect(svc.notifyNewInbound('c1', [item(2)], 'owner')).resolves.toBeUndefined();
  });
});
