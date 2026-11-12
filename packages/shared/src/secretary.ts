export interface MatterTaskItem {
  id: string; title: string; status: string; assigneeName: string | null; dueDate: string | null;
  daysStuck: number; daysOverdue: number; holdReason: string | null;
}

export interface MatterBrief {
  kind: 'case' | 'intake'; id: string; title: string; ownRef: string | null;
  clientName: string | null; partyRole: string | null;
  ourParties: string[]; opponents: { name: string; role: string }[]; opposingCounsel: string[];
  courtName: string | null; blackCaseNumber: string | null; redCaseNumber: string | null;
  claimedAmount: number | null;
  assessment: { decision: string | null; caseStrength: string | null; notes: string | null; estimatedDamage: number | null } | null;
  status: string | null; stage: string | null; stageChangedAt: string | null;
  recentEvents: { at: string; title: string }[];
  nextEvent: { id: string; at: string; title: string; type: string; courtName: string | null } | null;
  openTasks: MatterTaskItem[];
  leadLawyerName: string | null;
}

export type SecretaryCard =
  | { type: 'case'; id: string; title: string; ownRef: string | null }
  | { type: 'intake'; id: string; title: string }
  | { type: 'document'; id: string; caseId: string | null; filename: string }
  | { type: 'event'; id: string; caseId: string; title: string; startAt: string };

/** Web-app path a secretary card opens — shared by the web panel and the LINE bot's links. */
export function secretaryCardPath(card: SecretaryCard): string {
  switch (card.type) {
    case 'case':
      return `/cases/${card.id}`;
    case 'intake':
      return `/intake/${card.id}`;
    case 'document':
      return card.caseId ? `/cases/${card.caseId}?tab=documents` : '/documents';
    case 'event':
      return `/cases/${card.caseId}`;
  }
}

export function secretaryCardLabel(card: SecretaryCard): string {
  switch (card.type) {
    case 'case':
      return card.ownRef ? `${card.ownRef} · ${card.title}` : card.title;
    case 'intake':
      return `รับเรื่อง · ${card.title}`;
    case 'document':
      return card.filename;
    case 'event':
      return `${new Date(card.startAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })} · ${card.title}`;
  }
}

export type StuckItem = MatterTaskItem & {
  caseId: string | null; intakeId: string | null; matterTitle: string; hearingWithin7Days: boolean;
};

export interface DailyBriefData {
  generatedAt: string;
  stuckTaskDays: number;
  totals: { stuckTasks: number; overdueTasks: number; people: number };
  groups: { assigneeId: string | null; assigneeName: string; items: StuckItem[] }[];
  stuckCases: { caseId: string; title: string; stage: string | null; daysSinceStageChange: number }[];
}
