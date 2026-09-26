import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, DeadlineTrigger, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { LineLinkService } from '../notifications/line-link.service';
import { TravelService } from '../travel/travel.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { CreateEventDto, UpdateEventDto } from './dto/calendar.dto';
import { eventAssigneesInclude } from './event-people';
import { Prisma } from '../generated/prisma';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private lineMessaging: LineMessagingService,
    private lineLink: LineLinkService,
    private travelService: TravelService,
    private deadlineRules: DeadlineRulesService,
  ) {}

  private eventInclude = {
    case: {
      select: {
        id: true,
        firmId: true,
        ownRef: true,
        title: true,
        courtName: true,
        leadLawyer: { select: { id: true, firstName: true, lastName: true } },
      },
    },
    travelLog: true,
    assignee: { select: { id: true, firstName: true, lastName: true } },
    ...eventAssigneesInclude,
  };

  /**
   * Normalizes `assigneeIds`/legacy `assigneeId` into an id list, verifying
   * every id is a member of the firm. Returns undefined when neither field
   * was sent, so the caller knows to leave assignees untouched.
   */
  private async resolveAssigneeIds(
    firmId: string,
    dto: { assigneeIds?: string[]; assigneeId?: string | null },
  ): Promise<string[] | undefined> {
    const ids =
      dto.assigneeIds ??
      (dto.assigneeId != null ? [dto.assigneeId] : dto.assigneeId === null ? [] : undefined);
    if (ids === undefined) return undefined;
    if (ids.length === 0) return [];
    const members = await this.prisma.firmMember.findMany({
      where: { firmId, userId: { in: ids } },
      select: { userId: true },
    });
    const memberIds = new Set(members.map(m => m.userId));
    if (ids.some(userId => !memberIds.has(userId))) {
      throw new BadRequestException('ผู้รับผิดชอบต้องเป็นสมาชิกในสำนักงาน');
    }
    return ids;
  }

  async findAll(user: AuthUser, from?: string, to?: string) {
    const caseFilter = this.caseAccess.getCaseFilterForUser(user);
    const where: Prisma.CalendarEventWhereInput = {
      case: caseFilter,
    };

    if (from || to) {
      where.startAt = {};
      if (from) where.startAt.gte = new Date(from);
      if (to) where.startAt.lte = new Date(to);
    }

    return this.prisma.calendarEvent.findMany({
      where,
      include: this.eventInclude,
      orderBy: { startAt: 'asc' },
    });
  }

  /**
   * A single event is reachable by id, so it needs the same case filter the
   * list does — otherwise an id from another firm's case reads straight
   * through. The check runs on every read, edit and delete path.
   */
  async findOne(user: AuthUser, id: string) {
    const event = await this.findOneInternal(id);
    await this.assertCaseAccess(user, event.caseId);
    return event;
  }

  /** Unfiltered read for callers that have already authorized the case. */
  async findOneInternal(id: string) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id },
      include: this.eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async assertCaseAccess(user: AuthUser, caseId: string) {
    if (!(await this.caseAccess.canAccessCase(user, caseId))) {
      throw new ForbiddenException('No access to this case');
    }
  }

  /**
   * A court date starts procedural clocks, and the resulting deadline
   * suggestions are attributed to whoever entered the event.
   */
  async create(user: AuthUser, dto: CreateEventDto) {
    await this.assertCaseAccess(user, dto.caseId);
    return this.createInternal(dto, user.id);
  }

  /** Creation for callers that have already authorized the case. */
  async createInternal(dto: CreateEventDto, actorId?: string, tx?: Prisma.TransactionClient) {
    if (tx) {
      const legalCase = await tx.case.findUnique({ where: { id: dto.caseId } });
      if (!legalCase) throw new NotFoundException('Case not found');
      const { assigneeId: _legacyAssigneeId, assigneeIds: _assigneeIds, ...eventData } = dto;
      const ids = (await this.resolveAssigneeIds(legalCase.firmId, dto)) ?? [];
      const event = await tx.calendarEvent.create({ data: {
        ...eventData, startAt: new Date(dto.startAt), endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        courtName: dto.courtName ?? legalCase.courtName, reminderMinutes: dto.reminderMinutes ?? [4320, 1440, 60],
        assigneeId: ids[0] ?? null,
        assignees: { create: ids.map(userId => ({ userId })) },
      }, include: this.eventInclude });
      if (dto.type === EventType.COURT_DATE && actorId) {
        await tx.case.update({ where: { id: dto.caseId }, data: { status: 'COURT_DATE' } });
        await this.deadlineRules.applyTrigger({ caseId: dto.caseId, firmId: legalCase.firmId, caseTypeId: legalCase.caseTypeId, trigger: DeadlineTrigger.COURT_DATE, triggerDate: event.startAt, triggerEventId: event.id, createdById: actorId }, tx);
      }
      return event;
    }
    const legalCase = await this.prisma.case.findUnique({
      where: { id: dto.caseId },
      include: { leadLawyer: true },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const courtName = dto.courtName ?? legalCase.courtName ?? dto.title;
    const ids = (await this.resolveAssigneeIds(legalCase.firmId, dto)) ?? [];
    let travelLogId: string | undefined;

    if (dto.type === EventType.COURT_DATE && courtName) {
      const office = await this.travelService.getOfficeAddress();
      const travel = await this.travelService.calculateTravel(office, courtName);
      const log = await this.prisma.travelLog.findFirst({
        where: {
          origin: office,
          destination: courtName,
        },
        orderBy: { createdAt: 'desc' },
      });
      travelLogId = log?.id;

      const dateStr = new Date(dto.startAt).toLocaleString('th-TH');
      const lineUserIds = await this.lineLink.getLineUserIdsForCase(dto.caseId);
      await this.lineMessaging.sendCourtDateAlert(
        `📅 นัดศาล\nคดี: ${legalCase.ownRef} — ${legalCase.title}\nศาล: ${courtName}\nวันที่: ${dateStr}\nทนาย: ${legalCase.leadLawyer.firstName} ${legalCase.leadLawyer.lastName}${travel.warning ? `\n⚠️ ${travel.warning}` : ''}`,
        lineUserIds,
      );

      await this.prisma.case.update({
        where: { id: dto.caseId },
        data: { status: 'COURT_DATE' },
      });
    }

    const event = await this.prisma.calendarEvent.create({
      data: {
        caseId: dto.caseId,
        title: dto.title,
        description: dto.description,
        courtName,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        type: dto.type,
        reminderMinutes: dto.reminderMinutes ?? [4320, 1440, 60],
        assigneeId: ids[0] ?? null,
        assignees: { create: ids.map(userId => ({ userId })) },
        travelLogId,
      },
      include: this.eventInclude,
    });

    if (dto.type === EventType.COURT_DATE && actorId) {
      // Suggestions are a convenience: a rule engine failure must not lose the
      // court date the lawyer just entered.
      try {
        await this.deadlineRules.applyTrigger({
          caseId: dto.caseId,
          firmId: legalCase.firmId,
          caseTypeId: legalCase.caseTypeId,
          trigger: DeadlineTrigger.COURT_DATE,
          triggerDate: event.startAt,
          triggerEventId: event.id,
          createdById: actorId,
        });
      } catch (err) {
        this.logger.error(
          `Deadline rules failed for event ${event.id}: ${(err as Error).message}`,
        );
      }
    }

    return event;
  }

  async update(user: AuthUser, id: string, dto: UpdateEventDto) {
    await this.findOne(user, id);
    return this.updateInternal(id, dto);
  }

  /** Update for callers that have already authorized the case. */
  async updateInternal(id: string, dto: UpdateEventDto) {
    const existing = await this.findOneInternal(id);
    if (dto.startAt && new Date(dto.startAt).getTime() !== existing.startAt.getTime()) {
      throw new ConflictException('กรุณาใช้เลื่อนนัดเพื่อตรวจผลกระทบก่อน / Use reschedule to review affected deadlines');
    }
    const { assigneeId: _legacyAssigneeId, assigneeIds: _assigneeIds, ...eventData } = dto;
    const ids = await this.resolveAssigneeIds(existing.case.firmId, dto);
    if (ids !== undefined) {
      return this.prisma.$transaction(async tx => {
        await tx.calendarEventAssignee.deleteMany({ where: { eventId: id } });
        return tx.calendarEvent.update({
          where: { id },
          data: {
            ...eventData,
            startAt: undefined,
            endAt: dto.endAt ? new Date(dto.endAt) : undefined,
            assigneeId: ids[0] ?? null,
            assignees: { create: ids.map(userId => ({ userId })) },
          },
          include: this.eventInclude,
        });
      });
    }
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...eventData,
        startAt: undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
      },
      include: this.eventInclude,
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { deleted: true };
  }
}
