/**
 * Unified agenda types.
 *
 * A lawyer's day is made of two different records — `CalendarEvent` (court
 * dates, meetings) and `Task` (work with a due date). Neither alone answers
 * "what do I have tomorrow", so both are projected onto a single `AgendaItem`
 * that the /my-day screen, the LINE digest, and the conflict checker all read.
 */

export enum AgendaItemKind {
  COURT_DATE = 'COURT_DATE',
  CLIENT_MEETING = 'CLIENT_MEETING',
  DEADLINE = 'DEADLINE',
  TASK = 'TASK',
  OTHER = 'OTHER',
}

/** Which bucket the item falls into, relative to "now" in Asia/Bangkok. */
export enum AgendaUrgency {
  OVERDUE = 'OVERDUE',
  TODAY = 'TODAY',
  TOMORROW = 'TOMORROW',
  UPCOMING = 'UPCOMING',
}

export enum AgendaWarningKind {
  /** Two timed items occupy the same clock window. */
  OVERLAP = 'OVERLAP',
  /** Not enough time to travel between two consecutive locations. */
  TRAVEL = 'TRAVEL',
}

export interface AgendaWarning {
  kind: AgendaWarningKind;
  message: string;
  /** Ids of the agenda items involved, in chronological order. */
  itemIds: string[];
}

export interface AgendaItem {
  /** Unique within an agenda response: `event:<id>` or `task:<id>`. */
  id: string;
  /** The underlying record's id, for acting on it without parsing `id`. */
  entityId: string;
  kind: AgendaItemKind;
  title: string;
  /** ISO instant. For all-day items this is 00:00 Asia/Bangkok of that day. */
  at: string;
  /** ISO instant, when the source record has an end time. */
  endAt: string | null;
  /**
   * Deadlines and tasks are due on a *date*, not at a clock time. All-day items
   * sort to the top of their day and are never used for travel/overlap checks.
   */
  allDay: boolean;
  urgency: AgendaUrgency;
  caseId: string | null;
  caseRef: string | null;
  caseTitle: string | null;
  /** Where the lawyer physically has to be, when known. */
  location: string | null;
  /**
   * ISO instant the lawyer must leave the office by to arrive on time, when the
   * item has a location and travel time could be estimated.
   */
  departBy: string | null;
  /** Web route for the item, e.g. `/cases/<id>/calendar`. */
  url: string;
  /**
   * Who the task is assigned to. An owner or senior sees other people's
   * tasks on their day, and a row must say whose it is before offering a
   * "done" button for it. Null for events and unassigned tasks.
   */
  assigneeId: string | null;
  assigneeName: string | null;
  /** Every person responsible for the item, primary first. Empty for a task or an unassigned event. */
  assignees: { id: string; name: string }[];
}

export interface AgendaDay {
  /** `YYYY-MM-DD` in Asia/Bangkok. */
  date: string;
  items: AgendaItem[];
}

export interface MyDayResponse {
  /** `YYYY-MM-DD` in Asia/Bangkok that the response was computed for. */
  today: string;
  overdue: AgendaItem[];
  todayItems: AgendaItem[];
  tomorrow: AgendaItem[];
  upcoming: AgendaDay[];
  warnings: AgendaWarning[];
  reviewQueue: ReviewQueueItem[];
}

/** A task waiting for the caller's review ("รอฉันตรวจ"). */
export interface ReviewQueueItem {
  id: string;
  title: string;
  caseId: string | null;
  caseRef: string | null;
  caseTitle: string | null;
  workerName: string | null;
  submittedAt: string | null;
  dueDate: string | null;
}

/** What produced a date suggestion awaiting a lawyer's confirmation. */
export enum DateSuggestionSource {
  /** Extracted from an uploaded document by the intelligence pipeline. */
  DOCUMENT = 'DOCUMENT',
  /** Derived deterministically from a procedural deadline rule. */
  RULE = 'RULE',
  /** Read from a case email when the lawyer pressed the AI button on that message. */
  EMAIL = 'EMAIL',
}

/** The event that starts a procedural clock running. */
export enum DeadlineTrigger {
  COURT_DATE = 'COURT_DATE',
  JUDGMENT = 'JUDGMENT',
  ORDER_RECEIVED = 'ORDER_RECEIVED',
  COMPLAINT_SERVED = 'COMPLAINT_SERVED',
  /** ยื่นฟ้อง */
  FILED = 'FILED',
  /** ได้รับสำเนาอุทธรณ์ */
  APPEAL_SERVED = 'APPEAL_SERVED',
}

/** How the offset is counted from the trigger date. */
export enum DeadlineDayBasis {
  /** Every day counts. */
  CALENDAR = 'CALENDAR',
  /** Weekends and public holidays are skipped while counting. */
  BUSINESS = 'BUSINESS',
  /** Same day-of-month N months later; a missing day becomes the month's last day (ป.พ.พ. ม.193/3, ม.193/5). */
  MONTHS = 'MONTHS',
}

/** What kind of court sitting a COURT_DATE event is. */
export enum CourtEventKind {
  PRELIMINARY = 'PRELIMINARY',
  MEDIATION = 'MEDIATION',
  WITNESS_HEARING = 'WITNESS_HEARING',
  JUDGMENT_READING = 'JUDGMENT_READING',
  OTHER = 'OTHER',
}

export const COURT_EVENT_KIND_LABELS: Record<CourtEventKind, string> = {
  [CourtEventKind.PRELIMINARY]: 'นัดพร้อม / ชี้สองสถาน',
  [CourtEventKind.MEDIATION]: 'ไกล่เกลี่ย',
  [CourtEventKind.WITNESS_HEARING]: 'สืบพยาน',
  [CourtEventKind.JUDGMENT_READING]: 'ฟังคำพิพากษา',
  [CourtEventKind.OTHER]: 'อื่น ๆ',
};

/** How the summons and complaint reached the defendant. */
export enum ServiceMethod {
  /** รับเอง */
  PERSONAL = 'PERSONAL',
  /** ปิดหมาย — ม.79: service takes effect 15 days later */
  POSTED = 'POSTED',
}

export const SERVICE_METHOD_LABELS: Record<ServiceMethod, string> = {
  [ServiceMethod.PERSONAL]: 'รับเอง',
  [ServiceMethod.POSTED]: 'ปิดหมาย',
};

export interface DeadlineRuleItem {
  id: string;
  /** null = platform default shared by every firm; set = this firm's own rule or override. */
  firmId: string | null;
  caseTypeId: string | null;
  trigger: DeadlineTrigger;
  label: string;
  /** Days, or months for MONTHS; negative = before the trigger. */
  offsetDays: number;
  dayBasis: DeadlineDayBasis;
  /** Calendar days added after the offset (e.g. −90 for "10 years − 90 days"). */
  adjustDays: number;
  courtEventKind: CourtEventKind | null;
  courtLevel: 'TRIAL' | 'APPEAL' | 'SUPREME' | null;
  partySide: 'PLAINTIFF' | 'DEFENDANT' | 'PETITIONER' | 'RESPONDENT' | null;
  serviceMethod: ServiceMethod | null;
  isActive: boolean;
  /** Set by GET /deadline-rules: may the caller edit this row in place. */
  canEdit?: boolean;
}

/** What the engine knows about the case and the event when a trigger fires. */
export interface DeadlineRuleContext {
  courtEventKind?: CourtEventKind | null;
  /** The court level that ruled (JUDGMENT) or the case's level; unknown = TRIAL. */
  courtLevel?: 'TRIAL' | 'APPEAL' | 'SUPREME' | null;
  /** Case.partyRole — the side we act for; unknown = every side's rules apply. */
  partyRole?: string | null;
  /** How the summons was served; unknown = PERSONAL (รับเอง). */
  serviceMethod?: ServiceMethod | null;
}

/**
 * Structural (string-typed) so both DeadlineRuleItem and raw Prisma rows fit —
 * Prisma's enum columns are string-literal unions, which TS will not assign to these TS enums.
 */
export interface DeadlineRuleKey {
  firmId: string | null;
  trigger: string;
  label: string;
}
export interface DeadlineRuleFilter {
  isActive: boolean;
  courtEventKind: string | null;
  courtLevel: string | null;
  partySide: string | null;
  serviceMethod: string | null;
}

/** A firm rule overrides the global rule with the same trigger + label. */
export function deadlineRuleKey(rule: { trigger: string; label: string }): string {
  return `${rule.trigger}|${rule.label.trim()}`;
}

/**
 * The rules one firm runs: its own rules, plus every global rule it has not
 * overridden. Inactive rows are kept — an inactive override is how a firm
 * switches a global rule off — so filter with {@link deadlineRuleApplies}.
 */
export function effectiveDeadlineRules<T extends DeadlineRuleKey>(rules: T[], firmId: string): T[] {
  const own = rules.filter((rule) => rule.firmId === firmId);
  const overridden = new Set(own.map(deadlineRuleKey));
  return [
    ...rules.filter((rule) => rule.firmId === null && !overridden.has(deadlineRuleKey(rule))),
    ...own,
  ];
}

export function deadlineRuleApplies(rule: DeadlineRuleFilter, ctx: DeadlineRuleContext): boolean {
  if (!rule.isActive) return false;
  if (rule.courtEventKind && rule.courtEventKind !== ctx.courtEventKind) return false;
  if (rule.courtLevel && rule.courtLevel !== (ctx.courtLevel ?? 'TRIAL')) return false;
  if (rule.partySide && ctx.partyRole && rule.partySide !== ctx.partyRole) return false;
  if (rule.serviceMethod && rule.serviceMethod !== (ctx.serviceMethod ?? ServiceMethod.PERSONAL)) {
    return false;
  }
  return true;
}

export type DefaultDeadlineRule = Omit<DeadlineRuleItem, 'id' | 'firmId' | 'caseTypeId' | 'isActive' | 'canEdit'>;

const rule = (
  trigger: DeadlineTrigger,
  label: string,
  offsetDays: number,
  dayBasis: DeadlineDayBasis,
  filters: Partial<Pick<DefaultDeadlineRule, 'adjustDays' | 'courtEventKind' | 'courtLevel' | 'partySide' | 'serviceMethod'>> = {},
): DefaultDeadlineRule => ({
  trigger, label, offsetDays, dayBasis,
  adjustDays: 0, courtEventKind: null, courtLevel: null, partySide: null, serviceMethod: null,
  ...filters,
});

/** Platform defaults (spec L1). Every firm runs them unless it overrides one in /admin/deadline-rules. */
export const DEFAULT_DEADLINE_RULES: ReadonlyArray<DefaultDeadlineRule> = [
  rule(DeadlineTrigger.FILED, 'ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง', 7, DeadlineDayBasis.CALENDAR, { courtLevel: 'TRIAL' }), // ม.173, trial filing only
  rule(DeadlineTrigger.COMPLAINT_SERVED, 'ครบกำหนดยื่นคำให้การ', 15, DeadlineDayBasis.CALENDAR, { serviceMethod: ServiceMethod.PERSONAL }), // ม.177
  rule(DeadlineTrigger.COMPLAINT_SERVED, 'ครบกำหนดยื่นคำให้การ (ปิดหมาย)', 30, DeadlineDayBasis.CALENDAR, { serviceMethod: ServiceMethod.POSTED }), // ม.79 + ม.177
  rule(DeadlineTrigger.COMPLAINT_SERVED, 'ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด', 30, DeadlineDayBasis.CALENDAR, { partySide: 'PLAINTIFF' }), // ม.197–198
  rule(DeadlineTrigger.COURT_DATE, 'ยื่นบัญชีระบุพยาน', -7, DeadlineDayBasis.CALENDAR, { courtEventKind: CourtEventKind.WITNESS_HEARING }), // ม.88
  rule(DeadlineTrigger.COURT_DATE, 'สรุปผลนัดและรายงานลูกความ', 3, DeadlineDayBasis.BUSINESS),
  rule(DeadlineTrigger.JUDGMENT, 'ครบกำหนดยื่นอุทธรณ์', 1, DeadlineDayBasis.MONTHS, { courtLevel: 'TRIAL' }), // ม.229
  rule(DeadlineTrigger.JUDGMENT, 'ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา', 1, DeadlineDayBasis.MONTHS, { courtLevel: 'APPEAL' }), // ม.247
  rule(DeadlineTrigger.APPEAL_SERVED, 'ครบกำหนดยื่นคำแก้อุทธรณ์', 15, DeadlineDayBasis.CALENDAR), // ม.237
  rule(DeadlineTrigger.ORDER_RECEIVED, 'โต้แย้งคำสั่งศาล', 15, DeadlineDayBasis.CALENDAR),
  rule(DeadlineTrigger.JUDGMENT, 'ใกล้ครบระยะบังคับคดี 10 ปี', 120, DeadlineDayBasis.MONTHS, { adjustDays: -90 }), // ม.274
];
