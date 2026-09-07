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
}

/** What produced a date suggestion awaiting a lawyer's confirmation. */
export enum DateSuggestionSource {
  /** Extracted from an uploaded document by the intelligence pipeline. */
  DOCUMENT = 'DOCUMENT',
  /** Derived deterministically from a procedural deadline rule. */
  RULE = 'RULE',
}

/** The event that starts a procedural clock running. */
export enum DeadlineTrigger {
  COURT_DATE = 'COURT_DATE',
  JUDGMENT = 'JUDGMENT',
  ORDER_RECEIVED = 'ORDER_RECEIVED',
  COMPLAINT_SERVED = 'COMPLAINT_SERVED',
}

/** How the offset is counted from the trigger date. */
export enum DeadlineDayBasis {
  /** Every day counts. */
  CALENDAR = 'CALENDAR',
  /** Weekends and public holidays are skipped while counting. */
  BUSINESS = 'BUSINESS',
}

export interface DeadlineRuleItem {
  id: string;
  firmId: string;
  caseTypeId: string | null;
  trigger: DeadlineTrigger;
  label: string;
  offsetDays: number;
  dayBasis: DeadlineDayBasis;
  isActive: boolean;
}
