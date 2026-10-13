import { FirmRole } from '@lawfirm/shared';
import { OutlookConnectionsService } from '../outlook-integration/outlook-connections.service';
import { OutlookCalendarSyncService } from '../outlook-integration/calendar/outlook-calendar-sync.service';
import { lineActions } from '../notifications/line-actions';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, CourtEventKind, DeadlineTrigger, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { LineLinkService } from '../notifications/line-link.service';
import { TravelService } from '../travel/travel.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { CreateEventDto, UpdateEventDto } from './dto/calendar.dto';
import { eventAssigneesInclude, eventPeopleIds } from './event-people';
import { formatBangkokDateTime } from '../common/utils/bangkok-time';
import { NotificationCategory, Prisma } from '../generated/prisma';

/** Server-resolved Teams fields that never come straight from a request body. */
type MeetingFields = { meetingOrganizerId?: string | null; onlineMeetingUrl?: string | null; inviteeEmails?: string[] };

/**
 * The kind only means something on a court date; anything else stores null.
 * Takes plain strings because Prisma rows carry string-literal enums.
 */
function kindFor(type: string | undefined, kind: string | null | undefined): CourtEventKind | null {
  return type === EventType.COURT_DATE ? ((kind ?? null) as CourtEventKind | null) : null;
}

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private notifier: AssignmentNotifierService,
    private lineLink: LineLinkService,
    private travelService: TravelService,
    private deadlineRules: DeadlineRulesService,
    private outlookCalendar: OutlookCalendarSyncService,
    private outlookConnections: OutlookConnectionsService,
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
      where: { role: { not: FirmRole.EXTERNAL }, firmId, userId: { in: ids } },
      select: { userId: true },
    });
    const memberIds = new Set(members.map(m => m.userId));
    if (ids.some(userId => !memberIds.has(userId))) {
      throw new BadRequestException('ผู้รับผิดชอบต้องเป็นสมาชิกในสำนักงาน');
    }
    return ids;
  }

  private assertTeamsAllowed(type: string | undefined) {
    if ((type ?? EventType.OTHER) !== EventType.CLIENT_MEETING) {
      throw new BadRequestException('ประชุม Teams ใช้ได้กับนัดลูกความเท่านั้น');
    }
  }

  /** The actor if they have connected Microsoft 365, else the first attendee who has. */
  private async resolveMeetingOrganizer(actorId: string, attendeeIds: string[]): Promise<string> {
    for (const id of [actorId, ...attendeeIds]) {
      if (await this.outlookConnections.findActiveForUser(id)) return id;
    }
    throw new BadRequestException('ต้องเชื่อม Microsoft 365 ในหน้าตั้งค่าก่อนจึงสร้างลิงก์ Teams ได้');
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
    let meetingFields: MeetingFields = {};
    if (dto.onlineMeeting) {
      this.assertTeamsAllowed(dto.type);
      const legalCase = await this.prisma.case.findUnique({ where: { id: dto.caseId }, select: { firmId: true, leadLawyerId: true } });
      if (!legalCase) throw new NotFoundException('Case not found');
      // Members are validated before any connection is probed.
      const ids = (await this.resolveAssigneeIds(legalCase.firmId, dto)) ?? [];
      const people = ids.length ? ids : legalCase.leadLawyerId ? [legalCase.leadLawyerId] : [];
      meetingFields = { meetingOrganizerId: await this.resolveMeetingOrganizer(user.id, people), inviteeEmails: dto.inviteeEmails ?? [] };
    } else {
      meetingFields = { inviteeEmails: [] };
    }
    const event = await this.createInternal({ ...dto, ...meetingFields } as CreateEventDto & MeetingFields, user.id);
    this.outlookCalendar.syncEventSoon(event.id);
    return event;
  }

  /** Creation for callers that have already authorized the case. */
  async createInternal(dto: CreateEventDto & MeetingFields, actorId?: string, tx?: Prisma.TransactionClient) {
    if (tx) {
      const legalCase = await tx.case.findUnique({ where: { id: dto.caseId } });
      if (!legalCase) throw new NotFoundException('Case not found');
      const { assigneeId: _legacyAssigneeId, assigneeIds: _assigneeIds, ...eventData } = dto;
      const ids = (await this.resolveAssigneeIds(legalCase.firmId, dto)) ?? [];
      const event = await tx.calendarEvent.create({ data: {
        ...eventData, courtEventKind: kindFor(dto.type, dto.courtEventKind), startAt: new Date(dto.startAt), endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        courtName: dto.courtName ?? legalCase.courtName, reminderMinutes: dto.reminderMinutes ?? [4320, 1440, 60],
        assigneeId: ids[0] ?? null,
        assignees: { create: ids.map(userId => ({ userId })) },
      }, include: this.eventInclude });
      if (dto.type === EventType.COURT_DATE && actorId) {
        await tx.case.update({ where: { id: dto.caseId }, data: { status: 'COURT_DATE' } });
        await this.deadlineRules.applyTrigger({ caseId: dto.caseId, firmId: legalCase.firmId, caseTypeId: legalCase.caseTypeId, trigger: DeadlineTrigger.COURT_DATE, triggerDate: event.startAt, triggerEventId: event.id, createdById: actorId, courtEventKind: event.courtEventKind as CourtEventKind | null }, tx);
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
    let courtAlert: string | undefined;

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

      const dateStr = formatBangkokDateTime(new Date(dto.startAt));
      courtAlert = `📅 นัดศาล ${legalCase.ownRef} · ${dateStr}\nคดี: ${legalCase.title}\nศาล: ${courtName}\nทนาย: ${legalCase.leadLawyer.firstName} ${legalCase.leadLawyer.lastName}${travel.warning ? `\n⚠️ ${travel.warning}` : ''}`;

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
        courtEventKind: kindFor(dto.type, dto.courtEventKind),
        reminderMinutes: dto.reminderMinutes ?? [4320, 1440, 60],
        assigneeId: ids[0] ?? null,
        assignees: { create: ids.map(userId => ({ userId })) },
        travelLogId,
        onlineMeeting: dto.onlineMeeting,
        inviteeEmails: dto.inviteeEmails ?? [],
        meetingOrganizerId: dto.meetingOrganizerId,
      },
      include: this.eventInclude,
    });

    if (courtAlert) {
      // A new court date is case-wide news: the whole case team plus whoever was named on it.
      // The event is saved; failing to announce it must not fail the request.
      try {
        await this.notifier.notifyAssigned({
          firmId: legalCase.firmId,
          userIds: [...(await this.lineLink.getCaseTeamUserIds(dto.caseId)), ...ids],
          actorUserId: actorId ?? '',
          category: NotificationCategory.CALENDAR,
          summaryText: courtAlert,
          entityPath: `/court-day/${event.id}`,
          lineActions: (userId) => userId === (event.assigneeId ?? legalCase.leadLawyerId)
            ? lineActions.eventAck(event.id, event.updatedAt) : undefined,
        });
      } catch (err) {
        this.logger.error(`Court date notice for event ${event.id} failed: ${(err as Error).message}`);
      }
    }

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
          courtEventKind: event.courtEventKind as CourtEventKind | null,
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
    const existing = await this.findOne(user, id);
    const meeting: MeetingFields = {};
    const nextOnline = dto.onlineMeeting ?? existing.onlineMeeting;
    const nextType = dto.type ?? existing.type;
    const withdrawFrom = dto.onlineMeeting === false && existing.onlineMeeting ? existing.meetingOrganizerId : null;
    if (!nextOnline) {
      if (existing.onlineMeeting || dto.inviteeEmails) Object.assign(meeting, { onlineMeetingUrl: null, meetingOrganizerId: null, inviteeEmails: [] });
    } else {
      this.assertTeamsAllowed(nextType);
      if (dto.onlineMeeting === true && !(existing.onlineMeeting && existing.meetingOrganizerId)) {
        const requested = await this.resolveAssigneeIds(existing.case.firmId, dto);
        const lead = existing.case.leadLawyer?.id;
        const people = requested === undefined
          ? eventPeopleIds({ assignees: existing.assignees, case: { leadLawyerId: lead ?? null } })
          : requested.length ? requested : lead ? [lead] : [];
        meeting.meetingOrganizerId = await this.resolveMeetingOrganizer(user.id, people);
      }
    }
    const updated = await this.updateInternal(id, { ...dto, ...meeting });
    if (dto.courtEventKind && updated.type === EventType.COURT_DATE) {
      // A kind filled in later can unlock a kind-specific rule (ม.88 witness list).
      // applyTrigger dedupes per (event, rule), so rules already raised are not repeated.
      try {
        await this.deadlineRules.applyTrigger({
          caseId: updated.caseId,
          firmId: existing.case.firmId,
          caseTypeId: null,
          trigger: DeadlineTrigger.COURT_DATE,
          triggerDate: updated.startAt,
          triggerEventId: updated.id,
          createdById: user.id,
          courtEventKind: updated.courtEventKind as CourtEventKind | null,
        });
      } catch (err) {
        this.logger.error(`Deadline rules failed for event ${id}: ${(err as Error).message}`);
      }
    }
    if (withdrawFrom) this.outlookCalendar.withdrawOrganizerCopySoon(id, withdrawFrom);
    else this.outlookCalendar.syncEventSoon(id);
    return updated;
  }

  /** Update for callers that have already authorized the case. */
  async updateInternal(id: string, dto: UpdateEventDto & MeetingFields) {
    const existing = await this.findOneInternal(id);
    if (dto.startAt && new Date(dto.startAt).getTime() !== existing.startAt.getTime()) {
      throw new ConflictException('กรุณาใช้เลื่อนนัดเพื่อตรวจผลกระทบก่อน / Use reschedule to review affected deadlines');
    }
    const { assigneeId: _legacyAssigneeId, assigneeIds: _assigneeIds, ...eventData } = dto;
    const nextType = dto.type ?? existing.type;
    if (dto.type !== undefined || dto.courtEventKind !== undefined) {
      eventData.courtEventKind = kindFor(nextType, dto.courtEventKind !== undefined ? dto.courtEventKind : existing.courtEventKind);
    }
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
    this.outlookCalendar.syncEventSoon(id);
    return { deleted: true };
  }
}
