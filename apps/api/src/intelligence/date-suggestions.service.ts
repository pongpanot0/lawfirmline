import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DateSuggestionStatus, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';
import { CalendarService } from '../calendar/calendar.service';
import { ConfirmDateSuggestionDto } from './dto/date-suggestion.dto';

@Injectable()
export class DateSuggestionsService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  async listForCase(caseId: string, status: DateSuggestionStatus = DateSuggestionStatus.PENDING) {
    return this.prisma.documentDateSuggestion.findMany({
      where: { caseId, status },
      // A rule-derived suggestion has no source excerpt to show; the rule it
      // came from is what tells the lawyer where the date is from.
      include: { deadlineRule: { select: { label: true, trigger: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findPendingOrThrow(caseId: string, id: string, db: Prisma.TransactionClient) {
    const suggestion = await db.documentDateSuggestion.findUnique({ where: { id } });
    if (!suggestion || suggestion.caseId !== caseId) {
      throw new NotFoundException('Date suggestion not found');
    }
    if (suggestion.status !== DateSuggestionStatus.PENDING) {
      throw new ConflictException('Date suggestion is no longer pending');
    }
    return suggestion;
  }

  async confirm(
    caseId: string,
    id: string,
    userId: string,
    overrides: ConfirmDateSuggestionDto,
  ) {
    return this.prisma.$transaction(async db => {
      const suggestion = await this.lockPending(caseId, id, db);
      if ((suggestion.triggerEventId && !overrides.expectedUpdatedAt) ||
          (overrides.expectedUpdatedAt && suggestion.updatedAt.toISOString() !== overrides.expectedUpdatedAt)) {
        throw new ConflictException('Date suggestion changed; review it again');
      }
      if (suggestion.source === 'DOCUMENT' && !overrides.assigneeId) {
        throw new BadRequestException('Select a responsible lawyer for this date');
      }
      if (overrides.assigneeId) {
        const legalCase = await db.case.findUnique({ where: { id: caseId }, select: { firmId: true } });
        const assignee = legalCase && await db.user.findFirst({
          where: {
            id: overrides.assigneeId,
            role: { in: ['ADMIN', 'LAWYER'] },
            firmMembers: { some: { firmId: legalCase.firmId, role: { in: ['OWNER', 'SENIOR_LAWYER', 'LAWYER'] } } },
          },
          select: { id: true },
        });
        if (!assignee) throw new BadRequestException('Responsible lawyer is not in this firm');
      }
      const event = await this.calendarService.createInternal({
        caseId,
        title: overrides.label ?? suggestion.label,
        startAt: overrides.date ?? suggestion.suggestedDate.toISOString(),
        type: (overrides.eventType ?? suggestion.eventType) as EventType,
        reminderMinutes: overrides.reminderMinutes,
        assigneeId: overrides.assigneeId,
      }, userId, db);
      return db.documentDateSuggestion.update({
        where: { id },
        data: {
          status: DateSuggestionStatus.CONFIRMED,
          calendarEventId: event.id,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });
    });
  }

  private async lockPending(caseId: string, id: string, db: Prisma.TransactionClient) {
    const initial = await this.findPendingOrThrow(caseId, id, db);
    // Match rescheduling's parent-before-suggestion lock order.
    if (initial.triggerEventId) {
      await db.$queryRaw`SELECT "id" FROM "CalendarEvent" WHERE "id" = ${initial.triggerEventId} FOR UPDATE`;
    }
    await db.$queryRaw`SELECT "id" FROM "DocumentDateSuggestion" WHERE "id" = ${id} FOR UPDATE`;
    const current = await this.findPendingOrThrow(caseId, id, db);
    if (current.triggerEventId !== initial.triggerEventId) {
      throw new ConflictException('Date suggestion source changed; review it again');
    }
    return current;
  }

  async dismiss(caseId: string, id: string, userId: string) {
    return this.prisma.$transaction(async db => {
      await this.lockPending(caseId, id, db);
      return db.documentDateSuggestion.update({
        where: { id },
        data: {
          status: DateSuggestionStatus.DISMISSED,
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      });
    });
  }
}
