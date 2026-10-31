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
