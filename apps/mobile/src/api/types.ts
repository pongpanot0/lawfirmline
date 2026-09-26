/**
 * Response shapes the mobile app reads. Agenda types come from
 * @lawfirm/shared; the rest mirror what the controllers actually return,
 * trimmed to the fields the screens use.
 */
export type { AgendaItem, AgendaDay, MyDayResponse } from '@lawfirm/shared';

export interface AuthUserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  firmId?: string;
  firmName?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUserInfo;
}

export interface DashboardStats {
  stats: {
    totalCases: number;
    openCases: number;
    upcomingEvents: number;
    overdueTasks: number;
    myTasks: number;
  };
  upcomingHearings: Array<{
    id: string;
    title: string;
    startAt: string;
    courtName: string | null;
    case: { ownRef: string; title: string } | null;
  }>;
}

export interface CaseListItem {
  id: string;
  ownRef: string;
  title: string;
  status: string;
  clientName: string | null;
  courtName: string | null;
  blackCaseNumber: string | null;
  leadLawyer?: { id: string; firstName: string; lastName: string } | null;
  updatedAt: string;
}

export interface CaseDetail extends CaseListItem {
  description: string | null;
  claimedAmount: number | null;
  redCaseNumber: string | null;
  openedAt: string;
  client?: { id: string; name: string; phone?: string | null } | null;
}

export interface TaskItem {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  caseId: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  case?: { id: string; ownRef: string; title: string } | null;
}

export interface CalendarEventItem {
  id: string;
  caseId: string;
  title: string;
  courtName: string | null;
  startAt: string;
  endAt: string | null;
  type: string;
  case?: { id: string; ownRef: string; title: string } | null;
}

export interface WorkloadMember {
  id: string;
  name: string;
  openTasks: number;
  overdueTasks: number;
  openCases: number;
  hearingsThisWeek: number;
}

export interface WorkloadResponse {
  asOf: string;
  weekEndsAt: string;
  totals: { openTasks: number; overdueTasks: number; hearingsThisWeek: number };
  members: WorkloadMember[];
}

export interface CourtDayChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface CourtDayState {
  checklist: CourtDayChecklistItem[];
  taskIds: string[];
  documents: Array<{ id: string; version: number }>;
  notes: string;
  outcome: string;
  nextHearing: boolean;
  nextTitle: string;
  nextAt: string;
  followUp: boolean;
  taskTitle: string;
  taskDue: string;
}

export interface CourtDayResponse {
  event: CalendarEventItem & {
    case?: { id: string; ownRef: string; title: string; courtName: string | null } | null;
  };
  workspace: {
    eventId: string;
    version: number;
    state: CourtDayState;
    result: string | null;
    completedAt: string | null;
    updatedAt: string | null;
  };
}

export interface OwnerKpis {
  month: string;
  unbilled: { amount: number; caseCount: number };
  collectionRate: { value: number | null; target: 0.95; billed: number; collected: number };
  avgDaysOutstanding: number | null;
  revenue: { month: number; previousMonth: number };
  byLawyer: Array<{
    userId: string;
    name: string;
    openCases: number;
    billed: number;
    collected: number;
    rate: number | null;
  }>;
  stuckByStage: Array<{ stage: string; count: number; oldestDays: number }>;
}
