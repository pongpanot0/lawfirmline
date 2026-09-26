import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, DeadlineTrigger, MONEY_MAX } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { Prisma } from '../generated/prisma';
import {
  CompleteCourtDayDto,
  CourtDayStateDto,
  SaveCourtDayDto,
} from './dto/court-day.dto';
import { eventAssigneesInclude } from './event-people';

const json = (value: object): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));

export function newCourtDayState(): CourtDayStateDto {
  return {
    checklist: [],
    taskIds: [],
    documents: [],
    notes: '',
    outcome: '',
    nextHearing: false,
    nextTitle: '',
    nextAt: '',
    followUp: false,
    taskTitle: '',
    taskDue: '',
    expense: false,
    amount: '',
    clientDraft: true,
    draftRecipientKind: 'CLIENT',
    draftCustomerId: '',
  };
}

@Injectable()
export class CourtDayService {
  constructor(
    private prisma: PrismaService,
    private access: CaseAccessService,
    private deadlines: DeadlineRulesService,
  ) {}

  private async event(
    user: AuthUser,
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const event = await db.calendarEvent.findFirst({
      where: {
        id,
        type: 'COURT_DATE',
        case: this.access.getCaseFilterForUser(user),
      },
      include: {
        case: {
          select: {
            id: true,
            firmId: true,
            ownRef: true,
            title: true,
            clientId: true,
            clientName: true,
            client: { select: { id: true, name: true } },
            customers: { select: { customerId: true, isPrimary: true, customer: { select: { id: true, name: true } } } },
            courtName: true,
            caseTypeId: true,
            leadLawyerId: true,
            leadLawyer: { select: { firstName: true, lastName: true } },
          },
        },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        ...eventAssigneesInclude,
      },
    });
    if (!event)
      throw new NotFoundException(
        'ไม่พบนัดศาลหรือไม่มีสิทธิ์เข้าถึง / Court appointment unavailable',
      );
    return event;
  }

  async get(user: AuthUser, id: string) {
    const event = await this.event(user, id);
    const workspace = await this.prisma.courtDay.findUnique({
      where: { eventId: id },
    });
    return {
      event,
      workspace: workspace ?? {
        eventId: id,
        version: 0,
        state: newCourtDayState(),
        result: null,
        completedAt: null,
        updatedAt: null,
      },
    };
  }

  private async validateLinks(
    user: AuthUser,
    caseId: string,
    state: CourtDayStateDto,
    db: Prisma.TransactionClient,
  ) {
    if (
      new Set(state.checklist.map((x) => x.id)).size !==
        state.checklist.length ||
      new Set(state.taskIds).size !== state.taskIds.length ||
      new Set(state.documents.map((x) => x.id)).size !== state.documents.length
    ) {
      throw new BadRequestException('รายการซ้ำ / Duplicate items');
    }
    const tasks = await db.task.count({
      where: { id: { in: state.taskIds }, caseId },
    });
    if (tasks !== state.taskIds.length)
      throw new BadRequestException(
        'งานบางรายการไม่อยู่ในคดีหรือไม่มีสิทธิ์ / Task unavailable',
      );
    for (const document of state.documents) {
      const exists = await db.document.count({
        where: {
          id: document.id,
          caseId,
          OR: [
            { version: document.version },
            { versions: { some: { version: document.version } } },
          ],
        },
      });
      if (!exists)
        throw new BadRequestException(
          'เอกสารหรือฉบับที่เลือกไม่อยู่ในคดี / Document version unavailable',
        );
    }
  }

  async save(user: AuthUser, id: string, dto: SaveCourtDayDto) {
    return this.prisma.$transaction(async (db) => {
      const event = await this.event(user, id, db);
      await this.validateLinks(user, event.caseId, dto.state, db);
      // createMany skips a concurrent first save; the version predicate below
      // chooses exactly one writer, including the very first write.
      await db.courtDay.createMany({
        data: [
          {
            eventId: id,
            state: json(newCourtDayState()),
            updatedById: user.id,
          },
        ],
        skipDuplicates: true,
      });
      const saved = await db.courtDay.updateMany({
        where: { eventId: id, version: dto.version, completedAt: null },
        data: {
          state: json(dto.state),
          version: { increment: 1 },
          updatedById: user.id,
        },
      });
      if (!saved.count)
        throw new ConflictException(
          'มีข้อมูลใหม่จากอีกหน้าจอ กรุณาโหลดล่าสุด / This appointment was updated elsewhere',
        );
      return db.courtDay.findUniqueOrThrow({ where: { eventId: id } });
    });
  }

  async complete(user: AuthUser, id: string, dto: CompleteCourtDayDto) {
    return this.prisma.$transaction(
      async (db) => {
        const event = await this.event(user, id, db);
        // Lock the parent as well: a simultaneous calendar edit must finish
        // before the timestamp check, not change the appointment mid-recording.
        await db.$queryRaw`SELECT "id" FROM "CalendarEvent" WHERE "id" = ${id} FOR UPDATE`;
        const currentEvent = await this.event(user, id, db);
        // Use the locked event for all records created in this transaction.
        const current = await db.courtDay.findUnique({
          where: { eventId: id },
        });
        if (current?.completedAt) return current;
        if (
          !current ||
          current.version !== dto.version ||
          currentEvent.updatedAt.toISOString() !== dto.eventUpdatedAt
        ) {
          throw new ConflictException(
            'ข้อมูลนัดเปลี่ยนแล้ว กรุณาโหลดล่าสุด / Appointment changed; reload before recording',
          );
        }
        if (currentEvent.startAt > new Date())
          throw new BadRequestException(
            'ยังไม่ถึงเวลานัด / This appointment has not started',
          );
        const state = current.state as unknown as CourtDayStateDto;
        if (!state.outcome.trim())
          throw new BadRequestException(
            'กรุณาระบุผลนัด / Enter the hearing outcome',
          );
        const nextAt = state.nextAt ? new Date(state.nextAt) : null;
        const taskDue = state.taskDue ? new Date(state.taskDue) : null;
        if (
          state.nextHearing &&
          (!state.nextTitle.trim() ||
            !nextAt ||
            !Number.isFinite(nextAt.getTime()) ||
            nextAt <= currentEvent.startAt)
        ) {
          throw new BadRequestException(
            'ตรวจชื่อนัดและวันนัดครั้งหน้า / Check the next appointment',
          );
        }
        if (
          state.followUp &&
          (!state.taskTitle.trim() ||
            (taskDue && !Number.isFinite(taskDue.getTime())))
        ) {
          throw new BadRequestException(
            'ตรวจชื่องานและวันครบกำหนด / Check the follow-up task',
          );
        }
        const amount = Number(state.amount);
        if (
          state.expense &&
          (!/^\d+(\.\d{1,2})?$/.test(state.amount) ||
            amount <= 0 ||
            amount > MONEY_MAX)
        ) {
          throw new BadRequestException(
            'ตรวจยอดค่าใช้จ่าย / Check the expense amount',
          );
        }
        const recipientKind = state.draftRecipientKind ?? 'CLIENT';
        const selectedCustomer = state.clientDraft && recipientKind === 'CUSTOMER'
          ? await db.caseCustomer.findFirst({
              where: { caseId: event.caseId, customerId: state.draftCustomerId ?? '' },
              include: { customer: { select: { id: true, name: true } } },
            })
          : null;
        if (state.clientDraft && recipientKind === 'CUSTOMER' && !selectedCustomer) {
          throw new BadRequestException('เลือกผู้ว่าจ้างที่ผูกกับคดีนี้ก่อนสร้างร่างรายงาน');
        }
        const claimed = await db.courtDay.updateMany({
          where: { eventId: id, version: dto.version, completedAt: null },
          data: {
            version: { increment: 1 },
            completedAt: new Date(),
            updatedById: user.id,
          },
        });
        if (!claimed.count)
          throw new ConflictException('ข้อมูลเปลี่ยนแล้ว / Workspace changed');
        const activity = await db.caseActivity.create({
          data: {
            caseId: event.caseId,
            createdById: user.id,
            title: `ผลนัด: ${currentEvent.title}`,
            description: state.outcome.trim(),
            activityAt: currentEvent.startAt,
            type: 'COURT_DATE',
          },
        });
        const result: Record<string, string> = { activityId: activity.id };
        if (state.nextHearing) {
          // This is the lawyer's confirmed calendar entry. Recording a hearing
          // never sends an external message; scheduled reminders use the normal calendar.
          const next = await db.calendarEvent.create({
            data: {
              caseId: event.caseId,
              title: state.nextTitle.trim(),
              startAt: nextAt!,
              courtName: currentEvent.courtName,
              type: 'COURT_DATE',
              assigneeId: currentEvent.assigneeId,
              assignees: {
                create: currentEvent.assignees.map(a => ({ userId: a.userId })),
              },
            },
          });
          result.nextEventId = next.id;
          await db.case.update({
            where: { id: event.caseId },
            data: { status: 'COURT_DATE' },
          });
          await this.deadlines.applyTrigger(
            {
              caseId: event.caseId,
              firmId: user.firmId,
              caseTypeId: event.case.caseTypeId,
              trigger: DeadlineTrigger.COURT_DATE,
              triggerDate: next.startAt,
              triggerEventId: next.id,
              createdById: user.id,
            },
            db,
          );
        }
        if (state.followUp) {
          // The submitting lawyer takes responsibility; reassignment continues
          // through the existing handoff controls and audit history.
          const task = await db.task.create({
            data: {
              caseId: event.caseId,
              title: state.taskTitle.trim(),
              description: `ติดตามผลนัด ${currentEvent.title}`,
              dueDate: taskDue,
              createdById: user.id,
              assigneeId: user.id,
              assignmentLogs: {
                create: {
                  action: 'ASSIGNED',
                  toUserId: user.id,
                  performedById: user.id,
                  stageDueDate: taskDue,
                },
              },
            },
          });
          result.taskId = task.id;
        }
        if (state.expense) {
          const expense = await db.expense.create({
            data: {
              caseId: event.caseId,
              userId: user.id,
              amount,
              description:
                `${state.expenseCategory ?? 'ค่าเดินทาง'} — ${currentEvent.title}`.slice(
                  0,
                  500,
                ),
              category: state.expenseCategory ?? 'ค่าเดินทาง',
              date: currentEvent.startAt,
              sourceEventId: id,
              status: 'DRAFT',
            },
          });
          result.expenseId = expense.id;
        }
        if (state.clientDraft) {
          const date = currentEvent.startAt.toLocaleString('th-TH', {
            timeZone: 'Asia/Bangkok',
          });
          const draft = await db.closingEmailDraft.create({
            data: {
              caseId: event.caseId,
              createdById: user.id,
              recipientKind,
              recipientClientId: recipientKind === 'CUSTOMER' ? selectedCustomer!.customer.id : event.case.clientId,
              subject: `รายงานผลนัด ${event.case.ownRef} — ${currentEvent.title}`,
              bodyText: [
                `เรียน ${recipientKind === 'CUSTOMER' ? selectedCustomer!.customer.name : event.case.client?.name ?? event.case.clientName ?? 'ลูกความ'}`,
                `เรื่อง ${event.case.title} (${event.case.ownRef})`,
                `นัด ${currentEvent.title} วันที่ ${date}`,
                `ผลนัดที่ทนายบันทึก:\n${state.outcome.trim()}`,
                ...(state.nextHearing
                  ? [
                      `นัดครั้งหน้า: ${state.nextTitle.trim()} — ${nextAt!.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
                    ]
                  : []),
                ...(state.followUp
                  ? [`งานติดตาม: ${state.taskTitle.trim()}`]
                  : []),
                'ขอแสดงความนับถือ',
              ].join('\n\n'),
              selectedActivityIds: [activity.id],
              missingDataNotes: [
                'โปรดตรวจผลนัด วันนัด และชื่อผู้รับก่อนอนุมัติ',
              ],
            },
          });
          result.draftId = draft.id;
        }
        await db.auditLog.create({
          data: {
            firmId: user.firmId,
            userId: user.id,
            action: 'COURT_DAY_RECORDED',
            metadata: { eventId: id, ...result },
          },
        });
        return db.courtDay.update({ where: { eventId: id }, data: { result } });
      },
      { timeout: 15000 },
    );
  }
}
