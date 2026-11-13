import type { TaskRef } from './standup';

export interface CoachingDraft { praise: string; improve: string; nextStep: string; linkedTasks: TaskRef[] }
export interface CoachingNoteView {
  id: string;
  user: { id: string; firstName: string; lastName: string };
  author: { id: string; firstName: string; lastName: string };
  praise: string; improve: string; nextStep: string; linkedTasks: TaskRef[]; aiDrafted: boolean;
  acknowledgedAt: string | null; reply: string | null; createdAt: string;
}
export interface CoachingTeamSummary { sentThisMonth: number; awaitingAck: number; notCoached30d: number }
