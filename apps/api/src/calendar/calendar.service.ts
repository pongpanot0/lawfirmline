import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { LineLinkService } from '../notifications/line-link.service';
import { TravelService } from '../travel/travel.service';
import { CreateEventDto, UpdateEventDto } from './dto/calendar.dto';
import { Prisma } from '../generated/prisma';

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private lineMessaging: LineMessagingService,
    private lineLink: LineLinkService,
    private travelService: TravelService,
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

  async findOne(id: string) {
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id },
      include: this.eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async create(dto: CreateEventDto) {
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

    return this.prisma.calendarEvent.create({
      data: {
        caseId: dto.caseId,
        title: dto.title,
        description: dto.description,
        courtName,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        type: dto.type,
        reminderMinutes: dto.reminderMinutes ?? [4320, 1440, 60],
        travelLogId,
      },
      include: this.eventInclude,
    });
  }

  async update(id: string, dto: UpdateEventDto) {
    await this.findOne(id);
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

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { deleted: true };
  }
}
