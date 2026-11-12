import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthUser, HEAVY_QUEUE_POINTS, mcpCaseScope, hasFirmCapability, redactForAi, type TeamRadar } from '@lawfirm/shared';
import { DailyOperationsService } from '../operations/daily-operations.service';
import { bangkokDayKey } from '../common/utils/bangkok-time';
import { SecretaryToolsService } from '../secretary/secretary-tools.service';
import { ACTION_DESCRIPTIONS, ACTION_SCHEMAS, ActionName, isoDay as date, SecretaryActionsService } from '../secretary/secretary-actions.service';
import { FirmLinkService } from '../notifications/firm-link.service';

const text = z.string().trim().min(1);
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

@Injectable()
export class McpToolsService {
  constructor(
    private readonly secretary: SecretaryToolsService,
    private readonly links: FirmLinkService,
    private readonly operations: DailyOperationsService,
    private readonly actions: SecretaryActionsService,
  ) {}

  createServer(user: AuthUser, connection: { id: string; clientName: string }): McpServer {
    const server = new McpServer({ name: 'samnuan', version: '1.0.0' });
    const origin = this.links.originForSlug(user.firmSlug);
    const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(redactWithLinks(value, origin)) }] });
    const handle = async (run: () => Promise<unknown>) => {
      try { return result(await run()); }
      catch (e) {
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
          throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
        }
        return output;
      }));
    }
    // Team load is counts only (no case or task content) — the same numbers as the app's ทีม page, owners/office managers only.
    if (hasFirmCapability(user.firmRole, 'runOperations')) {
      server.registerTool('team_workload', {
        description: `Workload of every firm member for 7 days from a date (default today, Asia/Bangkok): open task points vs the ${HEAVY_QUEUE_POINTS}-point standard, overdue and review counts, and per-day task points, appointments, court dates and leave. Counts only — no case or task details. Use it for "who is free / overloaded".`,
        inputSchema: { from: date.optional() },
      }, (args: Record<string, unknown>) => handle(async () => teamWorkload(await this.operations.radar(user, (args.from as string | undefined) ?? bangkokDayKey(new Date())))));
    }
    for (const name of Object.keys(ACTION_SCHEMAS) as ActionName[]) {
      server.registerTool(name, { description: ACTION_DESCRIPTIONS[name], inputSchema: ACTION_SCHEMAS[name] }, (args: Record<string, unknown>) =>
        handle(() => this.actions.run(user, { kind: 'mcp', ...connection }, name, args)));
    }
    return server;
  }
}

const mcpScope = (user: AuthUser) => mcpCaseScope(user.firmRole);

/** Same status rule as the web TeamRadar card, spelled out so the model doesn't have to infer it. */
export function teamWorkload(radar: TeamRadar) {
  return {
    from: radar.start, standardPoints: HEAVY_QUEUE_POINTS,
    members: radar.members.map(({ userId: _id, days, ...m }) => {
      const leaveDays = days.filter((d) => d.onLeave).map((d) => d.date);
      const status = m.openPoints > HEAVY_QUEUE_POINTS ? 'over_standard'
        : m.openPoints >= HEAVY_QUEUE_POINTS * 0.8 ? 'near_standard'
          : leaveDays.length ? 'on_leave_this_week' : 'free';
      return { ...m, status, loadPercent: Math.round((m.openPoints / HEAVY_QUEUE_POINTS) * 100), leaveDays,
        days: days.map(({ onLeave: _l, ...d }) => d) };
    }),
  };
}

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
