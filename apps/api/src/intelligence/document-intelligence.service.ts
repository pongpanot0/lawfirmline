import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeCategory } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

const ANALYZE_COST = 5;

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
      return `[Demo Summary — set OPENAI_API_KEY for GPT-4o]\n\nKey excerpt: ${preview}...\n\n• Parties: See document\n• Dates: Review full text\n• Issues: Configure OpenAI for detailed analysis`;
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
        case: { select: { id: true, caseNumber: true, title: true } },
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
        case: { select: { id: true, caseNumber: true, title: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
