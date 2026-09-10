import {
  ForbiddenException,
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
        ownRef: true,
        title: true,
        courtName: true,
        leadLawyer: { select: { firstName: true, lastName: true } },
      },
    },
    travelLog: true,
    assignee: { select: { id: true, firstName: true, lastName: true } },
  };

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
  async createInternal(dto: CreateEventDto, actorId?: string) {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: dto.caseId },
      include: { leadLawyer: true },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const courtName = dto.courtName ?? legalCase.courtName ?? dto.title;
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
        assigneeId: dto.assigneeId ?? null,
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
    await this.findOneInternal(id);
    return this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...dto,
        startAt: dto.startAt ? new Date(dto.startAt) : undefined,
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
