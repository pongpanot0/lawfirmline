import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, DateSuggestionSource, DateSuggestionStatus } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { splitQuotedText } from './email-quote';

const dedupeKey = (label: string, date: Date | string) =>
  `${label.trim()}|${new Date(date).toISOString()}`;

@Injectable()
export class EmailDateSuggestionsService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private documentIntelligence: DocumentIntelligenceService,
  ) {}

  /**
   * "ให้ AI หาวันนัด / กำหนดยื่น" on one case email. Runs only when the lawyer presses the button
   * (the route carries the AI credit charge). Proposals land as PENDING DateSuggestions; no calendar event is created here.
   */
  async suggestFromMessage(user: AuthUser, caseId: string, messageId: string) {
    const message = await this.prisma.emailMessage.findFirst({
      where: {
        id: messageId,
        thread: { AND: [await this.caseAccess.getEmailThreadFilterForUser(user), { caseId }] },
      },
      select: { id: true, bodyText: true, thread: { select: { subject: true } } },
    });
    if (!message) throw new NotFoundException('ไม่พบอีเมลนี้ในคดี');

    const body = splitQuotedText(message.bodyText ?? '').main;
    if (!body) throw new BadRequestException('อีเมลนี้ไม่มีเนื้อหาให้ AI อ่าน');

    const candidates = await this.documentIntelligence.extractDatesWithAI(`${message.thread.subject}\n\n${body}`);

    const pending = await this.prisma.documentDateSuggestion.findMany({
      where: { caseId, status: DateSuggestionStatus.PENDING },
      select: { label: true, suggestedDate: true },
    });
    const seen = new Set(pending.map((row) => dedupeKey(row.label, row.suggestedDate)));
    const fresh = candidates.filter((c) => {
      const key = dedupeKey(c.label, c.date);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const suggestions = await this.prisma.$transaction(
      fresh.map((c) =>
        this.prisma.documentDateSuggestion.create({
          data: {
            caseId,
            label: c.label.trim(),
            suggestedDate: new Date(c.date),
            eventType: c.eventType,
            sourceExcerpt: c.sourceExcerpt,
            source: DateSuggestionSource.EMAIL,
            emailMessageId: message.id,
            createdById: user.id,
          },
        }),
      ),
    );
    return { created: suggestions.length, suggestions };
  }
}
