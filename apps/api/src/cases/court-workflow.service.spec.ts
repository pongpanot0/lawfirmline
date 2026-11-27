import {
  AnswerExtensionStatus,
  AuthUser,
  CourtFollowUpKind,
  CourtLevel,
  ServiceMethod,
} from '@lawfirm/shared';
import { validate } from 'class-validator';
import { eventPeopleIds } from '../calendar/event-people';
import { CaseFeedService } from '../common/services/case-feed.service';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CourtWorkflowService } from './court-workflow.service';
import { SetAnswerDeadlineDto } from './dto/court-workflow.dto';

const actor = { id: 'lawyer-1', firmId: 'firm-1' } as AuthUser;
const caseId = 'case-1';
const atCourtClose = (day: string) => new Date(`${day}T09:30:00.000Z`);

function arrange() {
  const legalCase = {
    id: caseId, status: 'OPEN', partyRole: 'PLAINTIFF', courtLevel: 'TRIAL', leadLawyerId: 'lead-1',
    answerDueAt: null as Date | null, answerDeadlineEventId: null as string | null,
  };
  type FollowUp = {
    id: string; kind: CourtFollowUpKind; dueAt: Date; doneAt: Date | null;
    lastResult: string | null; attempts: number; calendarEventId: string | null;
  };
  const followUps = new Map<CourtFollowUpKind, FollowUp>();
  const events = new Map<string, { id: string; startAt: Date }>();
  const extensions: Array<{
    id: string; status: AnswerExtensionStatus; filedAt: Date; requestedUntil: Date; grantedUntil: Date | null;
  }> = [];
  let eventSequence = 0;
  let previousFiling: Date | null = null;
  const db = {
    $queryRaw: jest.fn(async (query: TemplateStringsArray) =>
      query.join('').includes('FROM "CaseProceeding"') ? [{ filedAt: previousFiling }] : []),
    case: {
      findFirst: jest.fn(async () => ({ ...legalCase })),
      update: jest.fn(async ({ data }) => Object.assign(legalCase, data)),
    },
    courtFollowUp: {
      findUnique: jest.fn(async ({ where }) => followUps.get(where.caseId_kind.kind)),
      findMany: jest.fn(async () => Object.values(CourtFollowUpKind).flatMap((kind) => {
        const row = followUps.get(kind);
        return row ? [row] : [];
      })),
      upsert: jest.fn(async ({ where, create, update }) => {
        const { kind } = where.caseId_kind;
        const existing = followUps.get(kind);
        if (existing) return Object.assign(existing, update);
        const row = { id: kind, doneAt: null, lastResult: null, attempts: 0, calendarEventId: null, ...create };
        followUps.set(kind, row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = followUps.get(where.kind);
        if (!row || row.doneAt || row.dueAt.getTime() === where.dueAt.not.getTime()) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = followUps.get(where.caseId_kind?.kind ?? where.id)!;
        const { attempts, ...fields } = data;
        if (attempts) row.attempts += attempts.increment;
        return Object.assign(row, fields);
      }),
    },
    calendarEvent: {
      findFirst: jest.fn(async ({ where }) => events.get(where.id)),
      create: jest.fn(async ({ data }) => {
        const event = { ...data, id: `event-${++eventSequence}` };
        events.set(event.id, event);
        return event;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        Object.assign(events.get(where.id)!, data);
        return { count: 1 };
      }),
      deleteMany: jest.fn(async ({ where }) => ({ count: Number(events.delete(where.id)) })),
    },
    reminderLog: { deleteMany: jest.fn() },
    answerExtension: {
      findMany: jest.fn(async () => [...extensions].sort((a, b) => a.filedAt.getTime() - b.filedAt.getTime())),
      create: jest.fn(async ({ data }) => extensions.push({
        id: `ext-${extensions.length + 1}`, status: AnswerExtensionStatus.PENDING, grantedUntil: null, ...data,
      })),
      update: jest.fn(async ({ where, data }) => Object.assign(extensions.find(({ id }) => id === where.id)!, data)),
    },
  };
  const feed = { log: jest.fn() };
  const tx = db as unknown as Prisma.TransactionClient;
  const prisma = { ...db, $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(tx) };
  const service = new CourtWorkflowService(prisma as unknown as PrismaService, feed as unknown as CaseFeedService);
  const filing = async (day: string, level = CourtLevel.TRIAL) => {
    const filedAt = new Date(day);
    const target = await service.recordFiling(tx, actor, caseId, level, filedAt);
    previousFiling = filedAt;
    if (target) await service.syncAfterProceeding(actor, caseId, target);
  };
  const summons = async (day: string, method: ServiceMethod) => {
    const target = await service.recordService(tx, actor, caseId, new Date(day), method);
    if (target) await service.syncAfterProceeding(actor, caseId, target);
  };
  return { service, db, feed, legalCase, followUps, events, filing, summons };
}

describe('court follow-ups', () => {
  afterEach(() => jest.useRealTimers());

  it('creates reminders on filing and moves only undone items when the filing day changes', async () => {
    const { service, filing, followUps, events, db } = arrange();
    await filing('2026-11-18');
    expect(await service.listFollowUps(actor, caseId)).toEqual([
      { kind: 'ACCEPTANCE', dueAt: atCourtClose('2026-11-25').toISOString(), doneAt: null, lastResult: null, attempts: 0 },
      { kind: 'SERVICE', dueAt: atCourtClose('2026-12-02').toISOString(), doneAt: null, lastResult: null, attempts: 0 },
    ]);
    const serviceEventId = followUps.get(CourtFollowUpKind.SERVICE)!.calendarEventId!;
    expect(events.get(serviceEventId)).toMatchObject({ assigneeId: null, type: 'DEADLINE' });
    const reminder = { ...events.get(serviceEventId), case: { leadLawyerId: 'lead-1' } };
    expect(eventPeopleIds(reminder)).toEqual(['lead-1']);
    reminder.case.leadLawyerId = 'lead-2';
    expect(eventPeopleIds(reminder)).toEqual(['lead-2']);

    await service.recordFollowUpResult(actor, caseId, CourtFollowUpKind.ACCEPTANCE, { result: 'ศาลรับฟ้องแล้ว', done: true });
    await filing('2026-11-20');

    expect(followUps.get(CourtFollowUpKind.ACCEPTANCE)).toMatchObject({
      dueAt: atCourtClose('2026-11-25'), doneAt: expect.any(Date), calendarEventId: null,
    });
    expect(events.size).toBe(1);
    expect(events.get(serviceEventId)?.startAt).toEqual(atCourtClose('2026-12-04'));
    expect(db.reminderLog.deleteMany).toHaveBeenCalledWith({ where: { eventId: serviceEventId } });
  });

  it('marks service complete and upserts the answer follow-up and its single reminder', async () => {
    const { filing, summons, events, service, followUps } = arrange();
    await filing('2026-11-18');
    const serviceEventId = followUps.get(CourtFollowUpKind.SERVICE)!.calendarEventId!;
    await summons('2026-11-27', ServiceMethod.POSTED_ABROAD);
    const answerEventId = followUps.get(CourtFollowUpKind.ANSWER)!.calendarEventId!;

    expect(events.has(serviceEventId)).toBe(false);
    expect(events.get(answerEventId)?.startAt).toEqual(atCourtClose('2027-01-26'));
    expect(await service.listFollowUps(actor, caseId)).toEqual([
      expect.objectContaining({ kind: 'ACCEPTANCE' }),
      expect.objectContaining({ kind: 'SERVICE', doneAt: '2026-11-27T00:00:00.000Z',
        lastResult: 'ส่งหมายแล้ว (ปิดหมายตัวแทน (ส่งต่างประเทศ))', attempts: 0 }),
      expect.objectContaining({ kind: 'ANSWER', dueAt: atCourtClose('2027-01-26').toISOString() }),
    ]);

    await summons('2026-11-28', ServiceMethod.POSTED);
    expect(events.size).toBe(2);
    expect(events.get(answerEventId)?.startAt).toEqual(atCourtClose('2026-12-28'));

    await service.recordFollowUpResult(actor, caseId, CourtFollowUpKind.ANSWER, { result: 'ยื่นแล้ว', done: true });
    await summons('2026-11-29', ServiceMethod.POSTED);
    expect(followUps.get(CourtFollowUpKind.ANSWER)).toMatchObject({
      dueAt: atCourtClose('2026-12-29'), doneAt: expect.any(Date), attempts: 1, calendarEventId: null,
    });
  });

  it('reschedules from today in Bangkok, counts attempts and logs the result', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-27T18:00:00Z') });
    const { filing, service, feed, followUps, events } = arrange();
    const kind = CourtFollowUpKind.SERVICE;
    await filing('2026-11-18');
    const eventId = followUps.get(kind)!.calendarEventId!;
    const retry = await service.recordFollowUpResult(actor, caseId, kind, { result: 'ยังส่งไม่ได้', done: false });
    expect(retry).toMatchObject({ dueAt: atCourtClose('2026-12-05').toISOString(), doneAt: null, attempts: 1 });
    expect(events.get(eventId)?.startAt).toEqual(atCourtClose('2026-12-05'));
    expect(feed.log).toHaveBeenCalledWith(expect.objectContaining({
      type: 'DEADLINE', title: expect.stringMatching(/^โทรถามศาล:/), description: 'ยังส่งไม่ได้',
    }), expect.anything());

    await filing('2026-11-18');
    expect(events.get(eventId)?.startAt).toEqual(atCourtClose('2026-12-05'));
    const completed = await service.recordFollowUpResult(actor, caseId, kind, { result: 'ส่งแล้ว', done: true });
    expect(completed).toMatchObject({ doneAt: '2026-11-27T18:00:00.000Z', lastResult: 'ส่งแล้ว', attempts: 2 });
    expect(events.has(eventId)).toBe(false);
  });

  it('limits plaintiff follow-ups to trial and keeps the record when reminder creation fails', async () => {
    const { filing, summons, legalCase, followUps, db, events } = arrange();
    legalCase.courtLevel = 'APPEAL';
    await filing('2026-11-18', CourtLevel.APPEAL);
    await summons('2026-11-27', ServiceMethod.PERSONAL);
    expect(followUps.size).toBe(0);
    legalCase.courtLevel = 'TRIAL';
    db.calendarEvent.create.mockRejectedValueOnce(new Error('calendar unavailable'));
    await expect(filing('2026-11-18')).resolves.toBeUndefined();
    expect(followUps.size).toBe(2);
    expect(events.size).toBe(0);

    await filing('2026-11-18');
    expect(events.size).toBe(2);
  });
});

describe('answer deadlines', () => {
  function defendantCase() {
    const setup = arrange();
    setup.legalCase.partyRole = 'RESPONDENT';
    return setup;
  }

  it('links defendant-side service to the legal deadline and supports a manual correction', async () => {
    const { service, summons, legalCase, followUps, events } = defendantCase();
    await summons('2026-11-27T18:00:00Z', ServiceMethod.POSTED_ABROAD);
    expect(followUps.size).toBe(0);
    expect(await service.getAnswerDeadline(actor, caseId)).toEqual({
      answerDueAt: '2027-01-26T18:00:00.000Z',
      effectiveDueAt: '2027-01-26T18:00:00.000Z',
      fileBy: '2027-01-25T18:00:00.000Z',
      extensions: [],
    });
    const eventId = legalCase.answerDeadlineEventId!;
    expect(events.get(eventId)).toMatchObject({
      title: 'ครบกำหนดยื่นคำให้การ', type: 'DEADLINE', assigneeId: null,
      startAt: atCourtClose('2027-01-27'), description: expect.stringMatching(/^ยื่นไม่เกิน .*26 ม.ค./),
    });
    await service.setAnswerDeadline(actor, caseId, '2027-01-28');
    expect(events.size).toBe(1);
    expect(events.get(eventId)?.startAt).toEqual(atCourtClose('2027-01-28'));
  });

  it('uses the latest granted date and ignores pending and denied requests', async () => {
    const { service, legalCase, events } = defendantCase();
    await service.setAnswerDeadline(actor, caseId, '2026-12-12');
    const eventId = legalCase.answerDeadlineEventId!;
    const register = (filedAt: string) =>
      service.createAnswerExtension(actor, caseId, { filedAt, requestedUntil: '2027-04-01' });
    const setOrder = (id: string, status: AnswerExtensionStatus, grantedUntil?: string) =>
      service.updateAnswerExtension(actor, caseId, id, { status, grantedUntil });

    await register('2026-12-05');
    await register('2026-12-01');
    await register('2026-12-07');
    await setOrder('ext-2', AnswerExtensionStatus.GRANTED, '2026-12-22');
    await setOrder('ext-1', AnswerExtensionStatus.GRANTED, '2027-01-10');
    const current = await service.getAnswerDeadline(actor, caseId);
    expect(current.extensions.map(({ id, status }) => [id, status])).toEqual([
      ['ext-2', 'GRANTED'], ['ext-1', 'GRANTED'], ['ext-3', 'PENDING'],
    ]);
    expect(current).toMatchObject({
      effectiveDueAt: '2027-01-10T00:00:00.000Z', fileBy: '2027-01-09T00:00:00.000Z',
    });
    expect(events.get(eventId)?.startAt).toEqual(atCourtClose('2027-01-10'));

    const denied = await setOrder('ext-1', AnswerExtensionStatus.DENIED, '2027-02-01');
    expect(denied.extensions[1]).toMatchObject({ status: 'DENIED', grantedUntil: null });
    expect(denied.effectiveDueAt).toBe('2026-12-22T00:00:00.000Z');
    expect(events.get(eventId)?.startAt).toEqual(atCourtClose('2026-12-22'));
    const pending = await setOrder('ext-2', AnswerExtensionStatus.PENDING);
    expect(pending.extensions[0]).toMatchObject({ status: 'PENDING', grantedUntil: null });
    expect(pending.effectiveDueAt).toBe('2026-12-12T00:00:00.000Z');
    expect(events.get(eventId)?.startAt).toEqual(atCourtClose('2026-12-12'));
  });

  it('requires a grant date on or after the previous effective Bangkok day', async () => {
    const { service, db } = defendantCase();
    await service.setAnswerDeadline(actor, caseId, '2026-12-12');
    await service.createAnswerExtension(actor, caseId, { filedAt: '2026-12-01', requestedUntil: '2026-12-20' });
    const grant = (grantedUntil?: string) => service.updateAnswerExtension(actor, caseId, 'ext-1', {
      status: AnswerExtensionStatus.GRANTED, grantedUntil,
    });
    await expect(grant()).rejects.toThrow('กรุณาระบุวันที่');
    await expect(grant('2026-12-11')).rejects.toThrow('ต้องไม่ก่อน');
    expect(db.answerExtension.update).not.toHaveBeenCalled();
    await expect(grant('2026-12-11T18:00:00Z')).resolves.toMatchObject({ effectiveDueAt: '2026-12-11T18:00:00.000Z' });
    await expect(grant('2026-12-22')).resolves.toMatchObject({ effectiveDueAt: '2026-12-22T00:00:00.000Z' });
    // Correcting this extension's own grant downward is allowed; only the deadline without it bounds it.
    await expect(grant('2026-12-20')).resolves.toMatchObject({ effectiveDueAt: '2026-12-20T00:00:00.000Z' });
    await expect(grant('2026-12-11')).rejects.toThrow('ต้องไม่ก่อน');
  });

  it('allows reading a closed case, rejects writes, and scopes extension IDs to the case', async () => {
    const { service, legalCase, db } = defendantCase();
    await expect(service.updateAnswerExtension(actor, caseId, 'another-case-extension', {
      status: AnswerExtensionStatus.DENIED,
    })).rejects.toThrow('Answer extension not found');
    expect(db.answerExtension.update).not.toHaveBeenCalled();
    legalCase.status = 'CLOSED';
    await expect(service.getAnswerDeadline(actor, caseId)).resolves.toMatchObject({ effectiveDueAt: null });
    await expect(service.setAnswerDeadline(actor, caseId, '2026-12-12')).rejects.toThrow('คดีปิดแล้ว');
    expect(db.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: caseId, firmId: 'firm-1', deletedAt: null },
    }));
  });

  it.each([
    ['2026-12-11', true],
    ['2026-12-11T18:00:00Z', true],
    ['2026-12-12T01:00:00+07:00', true],
    ['2026-W48', false],
    ['2026-02-30', false],
    ['2026-12-11T18:00:00', false],
  ])('validates deadline date %s', async (answerDueAt, valid) => {
    const dto = Object.assign(new SetAnswerDeadlineDto(), { answerDueAt });
    expect((await validate(dto)).length === 0).toBe(valid);
  });
});
