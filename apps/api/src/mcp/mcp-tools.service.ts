import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthUser, mcpCaseScope, hasFirmCapability, redactForAi } from '@lawfirm/shared';
import { DailyOperationsService } from '../operations/daily-operations.service';
import { bangkokDayKey } from '../common/utils/bangkok-time';
import { SecretaryToolsService, teamWorkload } from '../secretary/secretary-tools.service';
import { AI_WRITE_DESCRIPTIONS, AI_WRITE_SCHEMAS, AI_WRITE_TOOLS, AiWriteToolsService, date, text } from '../secretary/ai-write-tools.service';
import { FirmLinkService } from '../notifications/firm-link.service';

const readSchemas = {
  find_matters: { query: text },
  case_overview: { caseId: text.optional(), intakeId: text.optional() },
  search_documents: { query: text, caseId: text.optional() },
  read_document: { documentId: text, question: text },
  list_events: { from: date, to: date, caseId: text.optional(), mineOnly: z.boolean().optional() },
  list_leaves: { from: date, to: date },
  search_sops: { query: text },
  lawyer_licenses: { withinDays: z.number().optional() },
  receivables: { minDaysOverdue: z.number().optional() },
  petty_cash_balance: {},
  my_work: {},
};
/** SecretaryToolsService error codes → what the AI app can act on (a wrong range is not "case not found"). */
const readErrors: Record<string, string> = {
  not_found: 'ไม่พบข้อมูลนี้ในงานของคุณ',
  invalid_date_range: 'ช่วงวันที่ไม่ถูกต้อง: วันสิ้นสุดต้องไม่ก่อนวันเริ่ม และ list_leaves ดูได้ครั้งละไม่เกิน 62 วัน',
  query_required: 'ระบุคำค้น',
  caseId_or_intakeId_required: 'ระบุ caseId หรือ intakeId',
  documentId_and_question_required: 'ระบุ documentId และคำถาม',
  forbidden: 'บทบาทของคุณใช้ข้อมูลนี้ไม่ได้',
};

@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);

  constructor(
    private readonly secretary: SecretaryToolsService,
    private readonly links: FirmLinkService,
    private readonly operations: DailyOperationsService,
    private readonly writes: AiWriteToolsService,
  ) {}

  createServer(user: AuthUser, connection: { id: string; clientName: string }): McpServer {
    const server = new McpServer({ name: 'samnuan', version: '1.0.0' });
    const origin = this.links.originForSlug(user.firmSlug);
    // ChatGPT reads structuredContent (it showed `{}` without it); Claude reads the text block. Send both, per the MCP spec.
    const result = (value: unknown) => {
      const data = redactWithLinks(value, origin);
      const structuredContent = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : { result: data };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent };
    };
    const handle = async (run: () => Promise<unknown>) => {
      try { return result(await run()); }
      catch (e) {
        // Expected refusals are HttpExceptions; anything else is a bug the AI app can only see as a generic error.
        if (!(e instanceof HttpException)) this.logger.error(`MCP tool failed (${connection.clientName})`, e instanceof Error ? e.stack : String(e));
        const message = e instanceof HttpException && /[ก-๙]/.test(e.message) ? e.message : 'ทำรายการไม่สำเร็จ กรุณาเปิดงานในแอปแล้วลองใหม่';
        return { ...result({ error: message }), isError: true };
      }
    };
    for (const definition of this.secretary.definitions(user)) {
      const name = definition.function.name as keyof typeof readSchemas;
      if (!(name in readSchemas)) continue;
      server.registerTool(name, { description: definition.function.description, inputSchema: readSchemas[name] }, (args: Record<string, unknown>) => handle(async () => {
        const output = await this.secretary.run(user, name, args, mcpScope(user));
        if (output.content && typeof output.content === 'object' && 'error' in output.content) {
          const code = String((output.content as { error: unknown }).error);
          throw new BadRequestException(readErrors[code] ?? 'ไม่พบข้อมูลนี้ในงานของคุณ');
        }
        return output;
      }));
    }
    // Team load is counts only (no case or task content) — the same numbers as the app's ทีม page, owners/office managers only.
    if (hasFirmCapability(user.firmRole, 'runOperations')) {
      server.registerTool('team_workload', {
        description: `Workload of every firm member for 7 days from a date (default today, Asia/Bangkok): open task points vs each member's own standard (standardPoints, from points they finished per week over the last 8 weeks), overdue and review counts, and per-day task points, appointments, court dates and leave. Counts only — no case or task details. Use it for "who is free / overloaded".`,
        inputSchema: { from: date.optional() },
      }, (args: Record<string, unknown>) => handle(async () => teamWorkload(await this.operations.radar(user, (args.from as string | undefined) ?? bangkokDayKey(new Date())))));
    }
    const via = { auditPrefix: 'mcp' as const, auditMetadata: { connectionId: connection.id, clientName: connection.clientName }, clientName: connection.clientName };
    for (const name of AI_WRITE_TOOLS) {
      server.registerTool(name, { description: AI_WRITE_DESCRIPTIONS[name], inputSchema: AI_WRITE_SCHEMAS[name] },
        (args: Record<string, unknown>) => handle(() => this.writes.run(user, name, args, via)));
    }
    return server;
  }
}

const mcpScope = (user: AuthUser) => mcpCaseScope(user.firmRole);

function redactWithLinks(value: unknown, origin: string, key = '', parentCaseId?: string): unknown {
  if (typeof value === 'string') return /^id$|Id$|^url$/.test(key) ? value : redactForAi(value).text;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redactWithLinks(v, origin, key, parentCaseId));
  if (!value || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  const isTask = row.kind === 'TASK' || key === 'openTasks';
  const caseId = row.caseId ?? ((row.kind === 'case' || row.type === 'case') ? row.id : isTask ? parentCaseId : undefined);
  const url = typeof caseId === 'string' ? `${origin}/cases/${encodeURIComponent(caseId)}${isTask && typeof row.id === 'string' ? `?task=${encodeURIComponent(row.id)}` : ''}`
    : isTask && row.caseId === null && typeof row.id === 'string' ? `${origin}/todos?task=${encodeURIComponent(row.id)}` : undefined;
  return { ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, redactWithLinks(v, origin, k, typeof caseId === 'string' ? caseId : parentCaseId)])), ...(url ? { url } : {}) };
}
