import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_CREDIT_COST, AuthUser, RedactionCounts, redactForAi } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { FileStorageService } from '../common/services/file-storage.service';

export const PRECEDENT_ANALYSIS_COST = AI_CREDIT_COST.PRECEDENT_ANALYSIS;

/**
 * Cap on extracted attachment text — applied both when storing `extractedFacts`
 * and when building the LLM prompt, so a large PDF never bloats the DB row (and
 * every API response that carries it).
 */
const MAX_ATTACHMENT_TEXT_LENGTH = 6000;

interface ExtractedFacts {
  /** Redacted, like every other free-form field here. */
  description: string | null;
  matterType: string | null;
  opposingParty: string | null;
  estimatedDamage: number | null;
  incidentDate: string | null;
  /** Redacted before it is stored or put in a prompt. */
  attachmentText: string | null;
  attachmentExtractionFailed: boolean;
  attachmentWarnings: string[];
  /** What redaction removed, per kind — evidence for the audit trail. */
  redaction: RedactionCounts;
}

/** Sums two redaction tallies, so one figure covers the whole intake. */
function mergeCounts(a: RedactionCounts, b: RedactionCounts): RedactionCounts {
  const merged: RedactionCounts = { ...a };
  for (const [kind, count] of Object.entries(b) as Array<[keyof RedactionCounts, number]>) {
    merged[kind] = (merged[kind] ?? 0) + count;
  }
  return merged;
}

@Injectable()
export class IntakePrecedentAnalysisService {
  private readonly logger = new Logger(IntakePrecedentAnalysisService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private iapp: IappLegalClient,
    private docIntelligence: DocumentIntelligenceService,
    private fileStorage: FileStorageService,
  ) {}

  private async gatherFacts(intake: {
    description: string | null;
    matterType: string | null;
    opposingParty: string | null;
    estimatedDamage: number | null;
    incidentDate: Date | null;
    attachments: Array<{ storagePath: string; mimeType: string; filename?: string }>;
  }): Promise<ExtractedFacts> {
    let attachmentText: string | null = null;
    let attachmentExtractionFailed = false;
    const attachmentWarnings: string[] = [];

    if (intake.attachments.length > 0) {
      const texts: string[] = [];
      for (const attachment of intake.attachments) {
        try {
          const buffer = await this.fileStorage.getBuffer(attachment.storagePath);
          const text = await this.docIntelligence.extractText(buffer, attachment.mimeType);
          if (!text.trim()) throw new Error('ไม่พบข้อความในเอกสาร');
          if (text.length > Math.floor(MAX_ATTACHMENT_TEXT_LENGTH / intake.attachments.length) - 150) attachmentWarnings.push(`อ่านเฉพาะบางส่วน: ${attachment.filename ?? 'เอกสาร'}`);
          texts.push(`[ไฟล์: ${(attachment.filename ?? 'เอกสาร').slice(0, 80)}]\n${text.slice(0, Math.floor(MAX_ATTACHMENT_TEXT_LENGTH / intake.attachments.length) - 150)}`);
        } catch (err) {
          this.logger.warn(`Failed to extract attachment text: ${(err as Error).message}`);
          attachmentExtractionFailed = true;
          attachmentWarnings.push(`อ่านไม่สำเร็จ: ${attachment.filename ?? 'เอกสาร'}`);
        }
      }
      attachmentText =
        texts.length > 0 ? texts.join('\n\n').slice(0, MAX_ATTACHMENT_TEXT_LENGTH) : null;
    }

    // Direct identifiers come out here, before the text is either stored or put
    // in a prompt. An attachment is a scan of the client's own paperwork — an
    // ID card, a medical record — and none of what identifies a person helps
    // find a precedent, so it neither lands in a row that every API response
    // carries nor leaves the country with the prompt.
    const redactedAttachment = redactForAi(attachmentText);
    const redactedDescription = redactForAi(intake.description);

    return {
      description: intake.description ? redactedDescription.text : null,
      matterType: intake.matterType,
      opposingParty: intake.opposingParty,
      estimatedDamage: intake.estimatedDamage,
      incidentDate: intake.incidentDate ? intake.incidentDate.toISOString().slice(0, 10) : null,
      attachmentText: attachmentText ? redactedAttachment.text : null,
      attachmentExtractionFailed,
      attachmentWarnings,
      redaction: mergeCounts(redactedDescription.counts, redactedAttachment.counts),
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
    options?: { json?: boolean },
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
        ...(options?.json ? { response_format: { type: 'json_object' } } : {}),
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

  /** Strip optional ``` / ```json fences before JSON.parse. */
  private stripJsonFences(raw: string): string {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  private coerceSummaryText(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value)) {
      const lines = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
      if (lines.length > 0) return lines.join('\n');
    }
    return fallback;
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
        'ตอบเป็น JSON object เท่านั้นในรูปแบบ {"summaryBullets": string, "noticeFacts": string}',
        'summaryBullets และ noticeFacts ต้องเป็น string (ไม่ใช่ array) — ใช้ \\n คั่นแต่ละข้อใน summaryBullets',
      ].join(' '),
      `ข้อเท็จจริงของเรื่อง:\n${factsText}\n\nฎีกาที่ค้นพบ:\n${precedentsText}`,
      { json: true },
    );

    try {
      const parsed = JSON.parse(this.stripJsonFences(content)) as {
        summaryBullets?: unknown;
        noticeFacts?: unknown;
      };
      return {
        summaryBullets: this.coerceSummaryText(parsed.summaryBullets, '(ไม่สามารถสรุปได้)'),
        noticeFacts: this.coerceSummaryText(parsed.noticeFacts, factsText),
      };
    } catch {
      this.logger.error(
        `Failed to parse OpenAI JSON response for precedent summary: ${content.slice(0, 200)}`,
      );
      return { summaryBullets: content || '(ไม่สามารถสรุปได้)', noticeFacts: factsText };
    }
  }

  /**
   * Every file on the intake that can be read for analysis.
   *
   * The page grew two stores: `IntakeAttachment`, which only the analyser could
   * see, and `Document`, which is the repository that follows the case. A
   * lawyer therefore had to upload the same PDF twice — once to have it read,
   * once for it to survive becoming a case. `Document` is now the store the
   * page writes to; attachments already on disk stay selectable here, and are
   * carried over as documents when the intake becomes a case.
   *
   * A carried-over attachment has a document pointing at the same file, so the
   * list is deduped by storage path to keep it out of the analysis twice.
   */
  private async selectableFiles(intakeId: string) {
    const [documents, attachments] = await Promise.all([
      this.prisma.document.findMany({
        where: { intakeId },
        select: { id: true, filename: true, mimeType: true, storagePath: true },
      }),
      this.prisma.intakeAttachment.findMany({
        where: { intakeId },
        select: { id: true, filename: true, mimeType: true, storagePath: true },
      }),
    ]);

    const seen = new Set(documents.map((file) => file.storagePath));
    return [...documents, ...attachments.filter((file) => !seen.has(file.storagePath))];
  }

  async analyze(user: AuthUser, intakeId: string, attachmentIds?: string[]) {
    const found = await this.prisma.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
      include: { attachments: true },
    });
    if (!found) throw new NotFoundException('Intake not found');

    const available = await this.selectableFiles(intakeId);
    const intake = { ...found, attachments: available };

    if (attachmentIds !== undefined) {
      if (attachmentIds.some((id) => !available.some((file) => file.id === id))) {
        throw new BadRequestException('ไฟล์ที่เลือกไม่อยู่ในเรื่องนี้ กรุณาโหลดรายการใหม่');
      }
      intake.attachments = available.filter((file) => attachmentIds.includes(file.id));
    }
    if (intake.attachments.length > 10) throw new BadRequestException('เลือกได้ไม่เกิน 10 ไฟล์ต่อครั้ง');


    if (!intake.description && intake.attachments.length === 0) {
      throw new BadRequestException('ไม่มีข้อมูลเพียงพอสำหรับวิเคราะห์ — กรุณากรอกรายละเอียดหรือแนบไฟล์ก่อน');
    }

    const facts = { ...await this.gatherFacts(intake), selectedAttachments: intake.attachments.map((file) => ({ id: file.id, filename: file.filename })) };
    const factsText = this.factsToText(facts);

    if (!factsText.trim()) {
      throw new BadRequestException(
        'ไม่สามารถอ่านข้อมูลจากเอกสารแนบได้ และไม่มีรายละเอียดเพิ่มเติม — กรุณาตรวจสอบไฟล์แนบหรือกรอกรายละเอียด',
      );
    }

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
    return analysis;
  }
}
