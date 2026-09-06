import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';

export const PRECEDENT_ANALYSIS_COST = 10;

/**
 * Cap on extracted attachment text — applied both when storing `extractedFacts`
 * and when building the LLM prompt, so a large PDF never bloats the DB row (and
 * every API response that carries it).
 */
const MAX_ATTACHMENT_TEXT_LENGTH = 6000;

interface ExtractedFacts {
  description: string | null;
  matterType: string | null;
  opposingParty: string | null;
  estimatedDamage: number | null;
  incidentDate: string | null;
  attachmentText: string | null;
  attachmentExtractionFailed: boolean;
}

@Injectable()
export class IntakePrecedentAnalysisService {
  private readonly logger = new Logger(IntakePrecedentAnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private iapp: IappLegalClient,
    private docIntelligence: DocumentIntelligenceService,
  ) {}

  private async gatherFacts(intake: {
    description: string | null;
    matterType: string | null;
    opposingParty: string | null;
    estimatedDamage: number | null;
    incidentDate: Date | null;
    attachments: Array<{ storagePath: string; mimeType: string }>;
  }): Promise<ExtractedFacts> {
    let attachmentText: string | null = null;
    let attachmentExtractionFailed = false;

    if (intake.attachments.length > 0) {
      const texts: string[] = [];
      for (const attachment of intake.attachments) {
        try {
          const fs = await import('fs');
          const buffer = fs.readFileSync(attachment.storagePath);
          const text = await this.docIntelligence.extractText(buffer, attachment.mimeType);
          texts.push(text);
        } catch (err) {
          this.logger.warn(`Failed to extract attachment text: ${(err as Error).message}`);
          attachmentExtractionFailed = true;
        }
      }
      attachmentText =
        texts.length > 0 ? texts.join('\n\n').slice(0, MAX_ATTACHMENT_TEXT_LENGTH) : null;
    }

    return {
      description: intake.description,
      matterType: intake.matterType,
      opposingParty: intake.opposingParty,
      estimatedDamage: intake.estimatedDamage,
      incidentDate: intake.incidentDate ? intake.incidentDate.toISOString().slice(0, 10) : null,
      attachmentText,
      attachmentExtractionFailed,
    };
  }

  private factsToText(facts: ExtractedFacts): string {
    return [
      facts.matterType ? `ประเภทเรื่อง: ${facts.matterType}` : null,
      facts.opposingParty ? `คู่กรณี: ${facts.opposingParty}` : null,
      facts.description ? `รายละเอียดเหตุการณ์: ${facts.description}` : null,
      facts.estimatedDamage ? `มูลค่าความเสียหายโดยประมาณ: ${facts.estimatedDamage} บาท` : null,
      facts.incidentDate ? `วันที่เกิดเหตุ: ${facts.incidentDate}` : null,
      facts.attachmentText ? `เนื้อหาจากเอกสารแนบ: ${facts.attachmentText.slice(0, MAX_ATTACHMENT_TEXT_LENGTH)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async callOpenAI(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      this.logger.error(`OpenAI error: ${res.status}`);
      throw new Error('AI precedent analysis failed');
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  private async extractSearchQuery(factsText: string): Promise<string> {
    return this.callOpenAI(
      'จากข้อเท็จจริงของเรื่องร้องเรียนที่ให้มา ให้สรุปเป็นคำค้นภาษาไทยสั้นๆ (1 ประโยค) ที่เหมาะสำหรับค้นหาคำพิพากษาศาลฎีกาที่เกี่ยวข้อง ตอบเฉพาะคำค้น ไม่ต้องมีคำอธิบายอื่น',
      factsText,
    );
  }

  private async summarizePrecedents(
    factsText: string,
    precedents: Array<{ dekaId: string; headnote: string; citedStatutes: string[] }>,
  ): Promise<{ summaryBullets: string; noticeFacts: string }> {
    const precedentsText =
      precedents.length > 0
        ? precedents
            .map((p) => `ฎ. ${p.dekaId}: ${p.headnote} (อ้างอิง: ${p.citedStatutes.join(', ') || '-'})`)
            .join('\n')
        : '(ไม่พบฎีกาที่เกี่ยวข้องโดยตรงจากการค้นหา)';

    const content = await this.callOpenAI(
      [
        'คุณเป็นผู้ช่วยทนายความไทย งานของคุณคือสรุปฎีกาที่เกี่ยวข้องที่ให้มาเป็นข้อๆ สั้นๆ ให้ทนายอ่านเร็วๆ',
        'และเตรียมข้อเท็จจริงในรูปแบบสำหรับใช้ร่างหนังสือบอกกล่าว',
        'ห้ามอ้างอิงฎีกาที่ไม่ได้อยู่ในรายการที่ให้มา ห้ามแต่งเลขฎีกาขึ้นเอง',
        'ตอบเป็น JSON เท่านั้นในรูปแบบ {"summaryBullets": string, "noticeFacts": string} ไม่ต้องมีข้อความอื่นนอกเหนือจาก JSON',
      ].join(' '),
      `ข้อเท็จจริงของเรื่อง:\n${factsText}\n\nฎีกาที่ค้นพบ:\n${precedentsText}`,
    );

    try {
      const parsed = JSON.parse(content) as { summaryBullets?: string; noticeFacts?: string };
      return {
        summaryBullets: parsed.summaryBullets ?? '(ไม่สามารถสรุปได้)',
        noticeFacts: parsed.noticeFacts ?? factsText,
      };
    } catch {
      this.logger.error('Failed to parse OpenAI JSON response for precedent summary');
      return { summaryBullets: content || '(ไม่สามารถสรุปได้)', noticeFacts: factsText };
    }
  }

  async analyze(user: AuthUser, intakeId: string) {
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
      include: { attachments: true },
    });
    if (!intake) throw new NotFoundException('Intake not found');

    if (!intake.description && intake.attachments.length === 0) {
      throw new BadRequestException('ไม่มีข้อมูลเพียงพอสำหรับวิเคราะห์ — กรุณากรอกรายละเอียดหรือแนบไฟล์ก่อน');
    }

    const facts = await this.gatherFacts(intake);
    const factsText = this.factsToText(facts);

    try {
      const searchQuery = await this.extractSearchQuery(factsText);

      const searchResults = await this.iapp.searchPrecedents(searchQuery, { topK: 5 });
      const topResults = searchResults.slice(0, 3);
      const detailed = await Promise.all(
        topResults.map((r) => Promise.resolve(this.iapp.getPrecedentDetail(r.dekaId)).catch(() => null)),
      );
      const precedents = topResults.map((r, i) => detailed[i] ?? r);

      const { summaryBullets, noticeFacts } = await this.summarizePrecedents(factsText, precedents);

      const creditsCost = 0.1 + 0.1 * topResults.length; // search + N detail lookups (IC estimate)

      return await this.prisma.intakePrecedentAnalysis.create({
        data: {
          intakeId,
          status: 'COMPLETE' as any,
          extractedFacts: facts as unknown as object,
          searchQueries: { query: searchQuery },
          precedents: precedents as unknown as object,
          summaryBullets,
          noticeFacts,
          creditsCost,
          createdById: user.id,
        },
      });
    } catch (err) {
      // Persist the failure for audit (how many times this was run, and why it
      // failed) — but re-throw so AiCreditsInterceptor, which only decrements
      // credit after a successful handler response, does not charge the user
      // for a run that produced nothing useful.
      //
      // The audit write itself must never replace the original failure: if it
      // throws (e.g. DB unavailable), log it separately and still re-throw the
      // ORIGINAL error so the caller sees the real pipeline failure reason.
      try {
        await this.prisma.intakePrecedentAnalysis.create({
          data: {
            intakeId,
            status: 'FAILED' as any,
            extractedFacts: facts as unknown as object,
            searchQueries: {},
            precedents: [],
            summaryBullets: '',
            noticeFacts: '',
            creditsCost: 0,
            createdById: user.id,
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        });
      } catch (auditErr) {
        this.logger.error(
          `Failed to persist FAILED precedent analysis audit record: ${
            auditErr instanceof Error ? auditErr.message : String(auditErr)
          }`,
        );
      }
      throw err;
    }
  }

  async listForIntake(user: AuthUser, intakeId: string) {
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
      select: { id: true },
    });
    if (!intake) throw new NotFoundException('Intake not found');

    return this.prisma.intakePrecedentAnalysis.findMany({
      where: { intakeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForCase(user: AuthUser, caseId: string) {
    return this.prisma.intakePrecedentAnalysis.findMany({
      where: { caseId, case: { firmId: user.firmId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(user: AuthUser, intakeId: string, analysisId: string) {
    const analysis = await this.prisma.intakePrecedentAnalysis.findFirst({
      where: { id: analysisId, intakeId, intake: { firmId: user.firmId } },
    });
    if (!analysis) throw new NotFoundException('Analysis not found');
    // A FAILED/PENDING analysis has an empty noticeFacts — drafting from it would
    // produce garbage while still charging AI credits. Throwing here also keeps
    // the credit interceptor from charging, since it only decrements on success.
    if (analysis.status !== 'COMPLETE') {
      throw new BadRequestException(
        'ผลการวิเคราะห์นี้ยังไม่สำเร็จ ไม่สามารถใช้ร่างหนังสือได้',
      );
    }
    return analysis;
  }
}
