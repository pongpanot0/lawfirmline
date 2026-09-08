import { Injectable } from '@nestjs/common';
import { ActivityType, AuthUser, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from '../calendar/calendar.service';
import { CreateActivityDto } from './dto/activity.dto';

function activityToEventType(type: ActivityType): EventType {
  switch (type) {
    case ActivityType.COURT_DATE:
      return EventType.COURT_DATE;
    case ActivityType.CLIENT_MEETING:
      return EventType.CLIENT_MEETING;
    case ActivityType.DEADLINE:
      return EventType.DEADLINE;
    default:
      return EventType.OTHER;
  }
}

@Injectable()
export class CaseActivitiesService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  async findByCase(caseId: string) {
    return this.prisma.caseActivity.findMany({
      where: { caseId },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { activityAt: 'desc' },
    });
  }

  async create(user: AuthUser, caseId: string, dto: CreateActivityDto, courtName?: string) {
    const activityType = dto.type ?? ActivityType.OTHER;
    const activityAt = new Date(dto.activityAt);
    const eventType = activityToEventType(activityType);

    const activity = await this.prisma.caseActivity.create({
      data: {
        caseId,
        title: dto.title,
        description: dto.description,
        activityAt,
        type: activityType,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    await this.calendarService.createInternal({
      caseId,
      title: dto.title,
      description: dto.description,
      courtName: activityType === ActivityType.COURT_DATE ? courtName : undefined,
      startAt: dto.activityAt,
      type: eventType,
    });

    return activity;
  }
}
