import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DateSuggestionStatus, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
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

  private async findPendingOrThrow(caseId: string, id: string) {
    const suggestion = await this.prisma.documentDateSuggestion.findUnique({ where: { id } });
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
    const suggestion = await this.findPendingOrThrow(caseId, id);

    const event = await this.calendarService.create({
      caseId,
      title: overrides.label ?? suggestion.label,
      startAt: overrides.date ?? suggestion.suggestedDate.toISOString(),
      type: (overrides.eventType ?? suggestion.eventType) as EventType,
      reminderMinutes: overrides.reminderMinutes,
    }, userId);

    return this.prisma.documentDateSuggestion.update({
      where: { id },
      data: {
        status: DateSuggestionStatus.CONFIRMED,
        calendarEventId: event.id,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
  }

  async dismiss(caseId: string, id: string, userId: string) {
    await this.findPendingOrThrow(caseId, id);

    return this.prisma.documentDateSuggestion.update({
      where: { id },
      data: {
        status: DateSuggestionStatus.DISMISSED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
  }
}
