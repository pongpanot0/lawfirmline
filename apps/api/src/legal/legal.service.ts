import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IappLegalClient } from '../intelligence/iapp-legal.client';

@Injectable()
export class LegalService {
  constructor(
    private prisma: PrismaService,
    private iapp: IappLegalClient,
  ) {}

  async ask(userId: string, caseId: string, question: string, citationIds: string[]) {
    // Facts must belong to this case — a citation id from another case is a
    // tenancy violation, not a 404.
    const citations = citationIds.length
      ? await this.prisma.knowledgeCitation.findMany({
          where: { id: { in: citationIds }, knowledge: { caseId } },
          select: { id: true, statement: true },
        })
      : [];
    if (citations.length !== citationIds.length) {
      throw new BadRequestException('มีข้อเท็จจริงที่ไม่อยู่ในคดีนี้');
    }

    const factsText = citations.map((c) => c.statement);
    const query = [question, ...factsText].join(' ').slice(0, 1000);
    const results = await this.iapp.searchPrecedents(query, { topK: 5 });

    const caseRow = await this.prisma.case.findUnique({ where: { id: caseId }, select: { firmId: true } });
    return this.prisma.legalQuery.create({
      data: {
        caseId,
        firmId: caseRow?.firmId ?? null,
        question,
        citationIds,
        factsText,
        results: JSON.parse(JSON.stringify(results)),
        createdById: userId,
      },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
  }

  list(caseId: string) {
    return this.prisma.legalQuery.findMany({
      where: { caseId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
  }
}
