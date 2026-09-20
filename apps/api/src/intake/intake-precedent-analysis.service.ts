import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { ReviewResearchFactDto } from './dto/research.dto';
import { ConfigService } from '@nestjs/config';
import { AI_CREDIT_COST, AuthUser, RedactionCounts, redactForAi, isUnusableAnalysis } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { RelevanceService } from '../rag/relevance.service';

export const PRECEDENT_ANALYSIS_COST = AI_CREDIT_COST.PRECEDENT_ANALYSIS;

/**
 * Cap on extracted attachment text — applied both when storing `extractedFacts`
 * and when building the LLM prompt, so a large PDF never bloats the DB row (and
 * every API response that carries it).
 */
const MAX_ATTACHMENT_TEXT_LENGTH = 12000;

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
    private relevance: RelevanceService,
    private caseAccess: CaseAccessService,
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
    // Direct identifiers come out per file, before the text is embedded,
    // stored, or put in a prompt. An attachment is a scan of the client's own
    // paperwork — an ID card, a medical record — and none of what identifies a
    // person helps find a precedent, so it neither lands in a row that every
    // API response carries nor leaves the country with the prompt.
    let attachmentRedaction: RedactionCounts = {};

    if (intake.attachments.length > 0) {
      const files: Array<{ label: string; text: string }> = [];
      for (const attachment of intake.attachments) {
        const label = (attachment.filename ?? 'เอกสาร').slice(0, 80);
        try {
          const buffer = await this.fileStorage.getBuffer(attachment.storagePath);
          const text = await this.docIntelligence.extractTextWithOcr(buffer, attachment.mimeType);
          if (!text.trim()) throw new Error('ไม่พบข้อความในเอกสาร');
          const redacted = redactForAi(text);
          attachmentRedaction = mergeCounts(attachmentRedaction, redacted.counts);
          files.push({ label, text: redacted.text });
        } catch (err) {
          this.logger.warn(`Failed to extract attachment text: ${(err as Error).message}`);
          attachmentExtractionFailed = true;
          attachmentWarnings.push(`อ่านไม่สำเร็จ: ${label}`);
        }
      }

      const totalLength = files.reduce((sum, file) => sum + file.text.length, 0);
      if (totalLength <= MAX_ATTACHMENT_TEXT_LENGTH) {
        // Everything fits — no retrieval needed.
        attachmentText = files.length
          ? files.map((file) => `[ไฟล์: ${file.label}]\n${file.text}`).join('\n\n')
          : null;
      } else {
        // RAG: pick the excerpts most relevant to what the user typed in,
        // instead of blindly keeping the head of each file.
        const query = [
          intake.matterType ? `ประเภทเรื่อง: ${intake.matterType}` : null,
          intake.opposingParty ? `คู่กรณี: ${intake.opposingParty}` : null,
          intake.description ? redactForAi(intake.description).text : null,
        ]
          .filter(Boolean)
          .join('\n');
        const selection = await this.relevance.selectRelevant(
          files,
          query,
          MAX_ATTACHMENT_TEXT_LENGTH,
        );
        if (selection) {
          attachmentText = selection.text;
          for (const label of selection.truncatedLabels) {
            attachmentWarnings.push(`อ่านเฉพาะส่วนที่เกี่ยวข้อง: ${label}`);
          }
        } else {
          // Embeddings unavailable — keep the old head-of-file slicing.
          const perFile = Math.floor(MAX_ATTACHMENT_TEXT_LENGTH / files.length) - 150;
          attachmentText = files
            .map((file) => {
              if (file.text.length > perFile) attachmentWarnings.push(`อ่านเฉพาะบางส่วน: ${file.label}`);
              return `[ไฟล์: ${file.label}]\n${file.text.slice(0, perFile)}`;
            })
            .join('\n\n')
            .slice(0, MAX_ATTACHMENT_TEXT_LENGTH);
        }
      }
    }

    const redactedDescription = redactForAi(intake.description);

    return {
      description: intake.description ? redactedDescription.text : null,
      matterType: intake.matterType,
      opposingParty: intake.opposingParty,
      estimatedDamage: intake.estimatedDamage,
      incidentDate: intake.incidentDate ? intake.incidentDate.toISOString().slice(0, 10) : null,
      attachmentText,
      attachmentExtractionFailed,
      attachmentWarnings,
      redaction: mergeCounts(redactedDescription.counts, attachmentRedaction),
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
      // Surface a real message instead of a blank 500 when the key is absent.
      throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่า AI (OPENAI_API_KEY) — ติดต่อผู้ดูแลระบบ');
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

  /** Coerces AI output into string[]; anything malformed becomes an empty list, never a crash. */
  private coerceStringList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && !!item.trim()).slice(0, 40);
  }

  private coerceTimeline(value: unknown): Array<{ date: string; event: string }> {
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (item): item is { date: string; event: string } =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).date === 'string' &&
          typeof (item as Record<string, unknown>).event === 'string',
      )
      .slice(0, 40);
  }

  private async summarizePrecedents(
    factsText: string,
    precedents: Array<{ dekaId: string; headnote: string; citedStatutes: string[] }>,
    summaryOnly = false,
  ): Promise<{
    documentSummary: string;
    summaryBullets: string;
    noticeFacts: string;
    factsList: string[];
    timeline: Array<{ date: string; event: string }>;
  }> {
    const precedentsText =
      precedents.length > 0
        ? precedents
            .map((p) => `ฎ. ${p.dekaId}: ${p.headnote} (อ้างอิง: ${p.citedStatutes.join(', ') || '-'})`)
            .join('\n')
        : '(ไม่พบฎีกาที่เกี่ยวข้องโดยตรงจากการค้นหา)';

    const content = await this.callOpenAI(
      [
        summaryOnly ? 'สรุปเฉพาะเนื้อหาเอกสารที่ให้มา ระบุชื่อไฟล์ต้นทางในแต่ละประเด็น แยกเนื้อหาที่ขัดแย้งและสิ่งที่ยังไม่ระบุ ห้ามวิเคราะห์กฎหมายหรือค้นฎีกา ให้ summaryBullets และ noticeFacts เป็นข้อความว่าง' : 'คุณเป็นผู้ช่วยทนายความไทย งานของคุณมีสามส่วน:',
        '1) documentSummary — สรุปเหตุการณ์/เนื้อหาจากข้อเท็จจริงและเอกสารแนบให้ทนายอ่านเข้าใจเร็ว',
        '   (ใคร เกิดอะไร เมื่อไหน ที่ไหน สัญญาณชีพ/อาการ/โรคประจำตัว/ประวัติสำคัญถ้ามี ผลตรวจหรือข้อเท็จจริงที่เอกสารระบุชัด)',
        '   เขียนเป็นภาษาไทย plain language ห้ามแต่งข้อเท็จจริงที่ไม่มีในข้อมูลที่ให้มา',
        summaryOnly ? '' : '2) summaryBullets — สรุปฎีกาที่เกี่ยวข้องที่ให้มาเป็นข้อๆ สั้นๆ',
        summaryOnly ? '' : '3) noticeFacts — เตรียมข้อเท็จจริงในรูปแบบสำหรับใช้ร่างหนังสือบอกกล่าว',
        '4) factsList — ข้อเท็จจริงสำคัญเป็น array ของ string ข้อละประเด็น สั้น กระชับ เรียงตามความสำคัญ',
        '5) timeline — เหตุการณ์ที่มีวันที่ระบุในเอกสาร เป็น array ของ {"date": string, "event": string} เรียงตามลำดับเวลา ใช้วันที่ตามที่เอกสารเขียน (พ.ศ.) ถ้าไม่มีวันที่ชัดเจนให้ข้ามเหตุการณ์นั้น ห้ามเดาวันที่',
        'ห้ามอ้างอิงฎีกาที่ไม่ได้อยู่ในรายการที่ให้มา ห้ามแต่งเลขฎีกาขึ้นเอง ห้ามแต่งข้อเท็จจริงหรือวันที่ที่ไม่มีในข้อมูล',
        'ตอบเป็น JSON object เท่านั้นในรูปแบบ {"documentSummary": string, "summaryBullets": string, "noticeFacts": string, "factsList": string[], "timeline": [{"date": string, "event": string}]}',
        'สามฟิลด์แรกต้องเป็น string (ไม่ใช่ array) — ใช้ \\n คั่นบรรทัดใน documentSummary และแต่ละข้อใน summaryBullets',
      ].join(' '),
      `ข้อเท็จจริงของเรื่อง:\n${factsText}\n\nฎีกาที่ค้นพบ:\n${precedentsText}`,
      { json: true },
    );

    try {
      const parsed = JSON.parse(this.stripJsonFences(content)) as {
        documentSummary?: unknown;
        summaryBullets?: unknown;
        noticeFacts?: unknown;
        factsList?: unknown;
        timeline?: unknown;
      };
      const documentSummary = this.coerceSummaryText(parsed.documentSummary, '');
      if (isUnusableAnalysis(documentSummary)) throw new Error('Unusable summary');
      return {
        documentSummary,
        summaryBullets: this.coerceSummaryText(parsed.summaryBullets, '(ไม่สามารถสรุปได้)'),
        noticeFacts: this.coerceSummaryText(parsed.noticeFacts, factsText),
        factsList: this.coerceStringList(parsed.factsList),
        timeline: this.coerceTimeline(parsed.timeline),
      };
    } catch {
      this.logger.error(
        'Failed to parse OpenAI JSON response for precedent summary',
      );
      throw new ServiceUnavailableException('AI ส่งผลวิเคราะห์ไม่สมบูรณ์ กรุณาลองใหม่');
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
        select: { id: true, filename: true, mimeType: true, storagePath: true, version: true },
      }),
      this.prisma.intakeAttachment.findMany({
        where: { intakeId },
        select: { id: true, filename: true, mimeType: true, storagePath: true },
      }),
    ]);

    const seen = new Set(documents.map((file) => file.storagePath));
    return [...documents, ...attachments.filter((file) => !seen.has(file.storagePath)).map((file) => ({ ...file, version: 1 }))];
  }

  async analyze(user: AuthUser, intakeId: string, attachmentIds?: string[], text?: string, factsOnly = false) {
    const found = await this.prisma.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
      include: { attachments: true, case: { select: { id: true } } },
    });
    if (!found) throw new NotFoundException('Intake not found');

    const available = await this.selectableFiles(intakeId);
    const intake = { ...found, description: text === undefined ? found.description : text.trim() || null, attachments: available };
    if (text && text.length > 12000) throw new BadRequestException('พิมพ์ได้ไม่เกิน 12,000 ตัวอักษร');

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

    const facts = { ...await this.gatherFacts(intake), selectedAttachments: intake.attachments.map((file) => ({ id: file.id, filename: file.filename, version: file.version })) };
    const factsText = this.factsToText(facts);

    if (!factsText.trim()) {
      throw new BadRequestException(
        'ไม่สามารถอ่านข้อมูลจากเอกสารแนบได้ และไม่มีรายละเอียดเพิ่มเติม — กรุณาตรวจสอบไฟล์แนบหรือกรอกรายละเอียด',
      );
    }

    try {
      const result = await this.buildResult(factsText, factsOnly);
      return await this.prisma.intakePrecedentAnalysis.create({
        data: {
          intakeId, firmId: user.firmId, caseId: found.case?.id ?? null,
          status: 'COMPLETE',
          extractedFacts: { ...facts, factItems: result.factItems, factsOnly } as unknown as Prisma.InputJsonValue,
          searchQueries: { query: result.searchQuery },
          precedents: result.precedents as unknown as Prisma.InputJsonValue,
          documentSummary: result.documentSummary,
          factsList: result.factsList,
          timeline: result.timeline,
          summaryBullets: result.summaryBullets,
          noticeFacts: result.noticeFacts,
          creditsCost: result.creditsCost,
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

  private async buildResult(factsText: string, factsOnly: boolean) {
    const searchQuery = factsOnly ? '' : await this.extractSearchQuery(factsText);
    const searchResults = factsOnly ? [] : await this.iapp.searchPrecedents(searchQuery, { topK: 5 });
    const topResults = searchResults.slice(0, 3);
    const detailed = await Promise.all(topResults.map((r) => Promise.resolve(this.iapp.getPrecedentDetail(r.dekaId)).catch(() => null)));
    const precedents = topResults.map((r, i) => detailed[i] ?? r);
    const summary = await this.summarizePrecedents(factsText, precedents);
    const extraction = await this.docIntelligence.extractFactsWithAI(factsText, { strict: true });
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    const factItems = extraction.facts.map((fact) => {
      // Only quote-backed facts become reviewable. Never turn the narrative into evidence.
      const sections = factsText.split(/(?=\[ไฟล์: )/);
      const source = sections.find((part) => normalize(part).includes(normalize(fact.quote))) ?? '';
      const filename = source.match(/^\[ไฟล์: (.+?)\]/)?.[1] ?? null;
      return { statement: fact.statement, quote: fact.quote, page: fact.page, source: filename ?? 'ข้อความที่ผู้ใช้ระบุ', status: 'PENDING', revisions: [] };
    });
    return { ...summary, searchQuery, precedents, factItems: [
      ...factItems,
      ...extraction.flags.map((flag) => ({ statement: flag.description, quote: '', page: null, source: 'ข้อสังเกตจาก AI — ยังไม่ใช่ข้อเท็จจริง', status: flag.type, revisions: [] })),
    ], creditsCost: factsOnly ? 0 : 0.1 + 0.1 * topResults.length };
  }

  async research(user: AuthUser, text: string | undefined, intakeId?: string, attachmentIds?: string[], factsOnly = false, caseId?: string) {
    if (caseId && intakeId) throw new BadRequestException('เลือกคดีหรือเรื่องรับเข้าเพียงหนึ่งอย่าง');
    if (caseId) return this.researchCase(user, caseId, text, attachmentIds ?? [], factsOnly);
    if (intakeId) return this.analyze(user, intakeId, attachmentIds ?? [], text, factsOnly);
    if (!text?.trim()) throw new BadRequestException('พิมพ์เหตุการณ์หรือประเด็นที่ต้องการค้นก่อน');
    const redacted = redactForAi(text.trim());
    const result = await this.buildResult(redacted.text, factsOnly);
    return this.prisma.intakePrecedentAnalysis.create({ data: {
      firmId: user.firmId, createdById: user.id, status: 'COMPLETE',
      extractedFacts: { description: redacted.text, redaction: redacted.counts, factItems: result.factItems, factsOnly, selectedAttachments: [], attachmentWarnings: [] } as unknown as Prisma.InputJsonValue,
      searchQueries: { query: result.searchQuery }, precedents: result.precedents as unknown as Prisma.InputJsonValue,
      documentSummary: result.documentSummary, factsList: result.factsList, timeline: result.timeline,
      summaryBullets: result.summaryBullets, noticeFacts: result.noticeFacts, creditsCost: result.creditsCost,
    } });
  }

  private async researchCase(user: AuthUser, caseId: string, text: string | undefined, attachmentIds: string[], factsOnly: boolean) {
    if (!await this.caseAccess.canAccessCase(user, caseId)) throw new NotFoundException('ไม่พบคดี');
    if ((!text?.trim() && !attachmentIds.length) || attachmentIds.length > 10) throw new BadRequestException('พิมพ์เรื่องหรือเลือกเอกสารไม่เกิน 10 ไฟล์');
    const files = await this.prisma.document.findMany({ where: { caseId, id: { in: attachmentIds } }, select: { id: true, filename: true, mimeType: true, storagePath: true, version: true } });
    if (files.length !== new Set(attachmentIds).size) throw new BadRequestException('ไฟล์ที่เลือกไม่อยู่ในคดีนี้');
    const facts = { ...await this.gatherFacts({ description: text?.trim() || null, attachments: files, matterType: null, opposingParty: null, estimatedDamage: null, incidentDate: null }), selectedAttachments: files.map((file) => ({ id: file.id, filename: file.filename, version: file.version })) };
    const factsText = this.factsToText(facts);
    if (!factsText.trim()) throw new BadRequestException('ไม่พบข้อความที่อ่านได้ กรุณาตรวจไฟล์หรือพิมพ์รายละเอียด');
    const result = await this.buildResult(factsText, factsOnly);
    return this.prisma.intakePrecedentAnalysis.create({ data: {
      caseId, firmId: user.firmId, createdById: user.id, status: 'COMPLETE',
      extractedFacts: { ...facts, factItems: result.factItems, factsOnly } as unknown as Prisma.InputJsonValue,
      searchQueries: { query: result.searchQuery }, precedents: result.precedents as unknown as Prisma.InputJsonValue,
      documentSummary: result.documentSummary, factsList: result.factsList, timeline: result.timeline,
      summaryBullets: result.summaryBullets, noticeFacts: result.noticeFacts, creditsCost: result.creditsCost,
    } });
  }

  async summarizeDocuments(user: AuthUser, intakeId?: string, caseId?: string, attachmentIds: string[] = []) {
    if ((!intakeId && !caseId) || (intakeId && caseId) || !attachmentIds.length || attachmentIds.length > 10) {
      throw new BadRequestException('เลือกเรื่องหรือคดี และเอกสาร 1–10 ไฟล์เพื่อสรุป');
    }
    let linkedCaseId = caseId ?? null;
    if (caseId && !await this.caseAccess.canAccessCase(user, caseId)) throw new NotFoundException('ไม่พบคดี');
    if (intakeId) {
      const intake = await this.prisma.intake.findFirst({ where: { id: intakeId, firmId: user.firmId }, include: { case: { select: { id: true } } } });
      if (!intake) throw new NotFoundException('ไม่พบเรื่อง');
      linkedCaseId = intake.case?.id ?? null;
    }
    const available = intakeId ? await this.selectableFiles(intakeId) : await this.prisma.document.findMany({
      where: { caseId: caseId!, id: { in: attachmentIds } },
      select: { id: true, filename: true, mimeType: true, storagePath: true, version: true },
    });
    const files = available.filter(file => attachmentIds.includes(file.id));
    if (files.length !== new Set(attachmentIds).size) throw new BadRequestException('ไฟล์ที่เลือกไม่อยู่ในเรื่องหรือคดีนี้');
    const facts = await this.gatherFacts({ description: null, matterType: null, opposingParty: null, estimatedDamage: null, incidentDate: null, attachments: files });
    if (!facts.attachmentText?.trim()) throw new BadRequestException('ไม่สามารถอ่านข้อความจากเอกสารที่เลือก กรุณาตรวจไฟล์แล้วลองใหม่');
    const summary = await this.summarizePrecedents(facts.attachmentText, [], true);
    return this.prisma.intakePrecedentAnalysis.create({ data: {
      intakeId: intakeId ?? null, caseId: linkedCaseId, firmId: user.firmId, createdById: user.id, status: 'COMPLETE',
      extractedFacts: { ...facts, summaryOnly: true, factsOnly: true, factItems: [], selectedAttachments: files.map(file => ({ id: file.id, filename: file.filename, version: file.version })) } as unknown as Prisma.InputJsonValue,
      documentSummary: summary.documentSummary, factsList: summary.factsList, timeline: summary.timeline,
      searchQueries: {}, precedents: [], summaryBullets: '', noticeFacts: '', creditsCost: 0,
    } });
  }

  async listResearch(user: AuthUser) {
    return this.prisma.intakePrecedentAnalysis.findMany({
      where: { firmId: user.firmId, createdById: user.id, intakeId: null, caseId: null },
      orderBy: { createdAt: 'desc' }, take: 30,
    });
  }

  async reviewFact(user: AuthUser, id: string, index: number, dto: ReviewResearchFactDto) {
    const row = await this.prisma.intakePrecedentAnalysis.findFirst({ where: { id,
      OR: [{ intake: { firmId: user.firmId }, caseId: null }, { intakeId: null, caseId: null, firmId: user.firmId, createdById: user.id }, { case: this.caseAccess.getCaseFilterForUser(user) }],
    } });
    if (!row || row.status !== 'COMPLETE') throw new NotFoundException('ไม่พบผลวิเคราะห์');
    if (!dto.statement.trim()) throw new BadRequestException('ข้อเท็จจริงต้องไม่ว่าง');
    const extracted = structuredClone(row.extractedFacts) as Record<string, Prisma.JsonValue>;
    const items = extracted.factItems as Array<Record<string, Prisma.JsonValue>> | undefined;
    const fact = items?.[index];
    if (!fact || !Number.isInteger(index) || index < 0) throw new NotFoundException('ไม่พบข้อเท็จจริง');
    if (fact.statement !== dto.expectedStatement || fact.status !== dto.expectedStatus) throw new ConflictException('มีการแก้ไขรายการนี้แล้ว กรุณาโหลดผลล่าสุด');
    if (dto.status === 'REVIEWED' && !fact.quote) throw new BadRequestException('ข้อสังเกตที่ไม่มีแหล่งอ้างอิงไม่สามารถยืนยันเป็นข้อเท็จจริงได้');
    const revisions = Array.isArray(fact.revisions) ? fact.revisions : [];
    items![index] = { ...fact, statement: dto.statement.trim(), status: dto.status, reviewedById: user.id,
      reviewedAt: new Date().toISOString(), revisions: [...revisions, { statement: fact.statement, status: fact.status, userId: user.id, at: new Date().toISOString() }],
    };
    // Compare the complete old JSON to avoid losing another review saved concurrently.
    const updated = await this.prisma.intakePrecedentAnalysis.updateMany({
      where: { id, extractedFacts: { equals: row.extractedFacts as Prisma.InputJsonValue } },
      data: { extractedFacts: { ...extracted, factItems: items } as Prisma.InputJsonValue },
    });
    if (!updated.count) throw new ConflictException('มีการแก้ไขผลนี้แล้ว กรุณาโหลดผลล่าสุด');
    return this.prisma.intakePrecedentAnalysis.findUniqueOrThrow({ where: { id } });
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
