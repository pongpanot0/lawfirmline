import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeCategory, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

const ANALYZE_COST = 5;

interface ExtractedDateCandidate {
  label: string;
  date: string;
  eventType: EventType;
  sourceExcerpt: string;
}

interface RawDateCandidate {
  label?: unknown;
  date?: unknown;
  eventType?: unknown;
  sourceExcerpt?: unknown;
}

@Injectable()
export class DocumentIntelligenceService {
  private readonly logger = new Logger(DocumentIntelligenceService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  getAnalyzeCost() {
    return ANALYZE_COST;
  }

  async extractText(fileBuffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      const data = await pdfParse(fileBuffer);
      return data.text ?? '';
    }
    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'text/plain'
    ) {
      return fileBuffer.toString('utf-8');
    }
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  async summarizeWithAI(text: string): Promise<string> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      const preview = text.slice(0, 500).replace(/\s+/g, ' ').trim();
      return `[ตัวอย่างสรุป — ตั้งค่า OPENAI_API_KEY เพื่อให้ AI วิเคราะห์จริง]\n\nข้อความบางส่วน: ${preview}...\n\n• คู่กรณี: โปรดดูในเอกสาร\n• วันที่: โปรดตรวจสอบเอกสารฉบับเต็ม\n• ประเด็นสำคัญ: ตั้งค่า OpenAI เพื่อวิเคราะห์โดยละเอียด`;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Summarize this legal document, highlight key dates, parties, and critical issues. Respond in Thai when the document is in Thai, otherwise English.',
          },
          { role: 'user', content: text.slice(0, 12000) },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      this.logger.error(`OpenAI error: ${res.status}`);
      throw new Error('AI summarization failed');
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? 'No summary generated';
  }

  async extractDatesWithAI(text: string): Promise<ExtractedDateCandidate[]> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) return [];

    let raw: string | undefined;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Find every important date in this legal document (court hearing dates, filing deadlines, statutory deadlines). Respond ONLY with JSON of the shape {"dates": [{"label": string, "date": "YYYY-MM-DD", "eventType": "COURT_DATE"|"DEADLINE"|"CLIENT_MEETING"|"OTHER", "sourceExcerpt": string}]}. "sourceExcerpt" must be the exact sentence from the document the date came from. If no dates are found, respond {"dates": []}. Write labels in Thai when the document is in Thai, otherwise English.',
            },
            { role: 'user', content: text.slice(0, 12000) },
          ],
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        this.logger.error(`OpenAI error (date extraction): ${res.status}`);
        return [];
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      raw = data.choices?.[0]?.message?.content;
    } catch (err) {
      this.logger.error(`OpenAI request failed (date extraction): ${err}`);
      return [];
    }

    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn('Failed to parse AI date-extraction response as JSON');
      return [];
    }

    const dates = (parsed as { dates?: unknown } | null)?.dates;
    if (!Array.isArray(dates)) return [];

    const validEventTypes = new Set<string>(Object.values(EventType));
    const results: ExtractedDateCandidate[] = [];

    for (const rawItem of dates) {
      const item = rawItem as RawDateCandidate;
      if (
        typeof item?.label !== 'string' ||
        typeof item?.date !== 'string' ||
        typeof item?.sourceExcerpt !== 'string'
      ) {
        continue;
      }

      const parsedDate = new Date(item.date);
      if (isNaN(parsedDate.getTime())) continue;

      const eventType = validEventTypes.has(item.eventType as string)
        ? (item.eventType as EventType)
        : EventType.OTHER;

      results.push({
        label: item.label,
        date: parsedDate.toISOString(),
        eventType,
        sourceExcerpt: item.sourceExcerpt,
      });
    }

    return results;
  }

  async extractDates(
    fileBuffer: Buffer,
    mimeType: string,
    caseId: string,
    userId: string,
    documentId?: string,
  ) {
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');

    const text = await this.extractText(fileBuffer, mimeType);
    const candidates = await this.extractDatesWithAI(text);

    return Promise.all(
      candidates.map((c) =>
        this.prisma.documentDateSuggestion.create({
          data: {
            caseId,
            documentId,
            label: c.label,
            suggestedDate: new Date(c.date),
            eventType: c.eventType,
            sourceExcerpt: c.sourceExcerpt,
            createdById: userId,
          },
        }),
      ),
    );
  }

  async analyzeDocument(
    fileBuffer: Buffer,
    mimeType: string,
    caseId: string,
    userId: string,
    documentId?: string,
    title?: string,
  ) {
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');

    const text = await this.extractText(fileBuffer, mimeType);
    const summary = await this.summarizeWithAI(text);

    return this.prisma.caseKnowledge.create({
      data: {
        caseId,
        documentId,
        title: title ?? 'Document Analysis',
        summary,
        category: KnowledgeCategory.SUMMARY,
        createdById: userId,
      },
      include: {
        case: { select: { id: true, ownRef: true, title: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findKnowledge(caseId?: string, category?: KnowledgeCategory, search?: string) {
    return this.prisma.caseKnowledge.findMany({
      where: {
        ...(caseId ? { caseId } : {}),
        ...(category ? { category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { summary: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        case: { select: { id: true, ownRef: true, title: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
