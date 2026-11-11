import { CASE_STAGE_LABELS_TH } from '@lawfirm/shared';
import { caseJourney, nextJourneyStage } from './case-journey';

export type CaseBucket = 'TODO' | 'WAITING_CLIENT' | 'WAITING_COURT' | 'CLOSED';
export interface CaseProgress {
  caseId: string;
  bucket: CaseBucket;
  stepIndex: number;
  stepTotal: number;
  stepLabel: string;
  done: number;
  total: number;
  next: {
    kind: 'INFO' | 'PRELIT' | 'TASK' | 'ADVANCE' | 'SET_NEXT' | 'WAIT_CLIENT';
    text: string;
    taskId?: string;
    dueDate?: string;
    assigneeName?: string;
  } | null;
  nextCourtDate: string | null;
}

export function caseProgress(
  legalCase: { id: string; status: string; stage: string },
  journey: ReturnType<typeof caseJourney>,
  requests: { required: boolean; status: string }[],
  nextCourtDate: string | null,
): CaseProgress {
  const pendingTask = journey.currentTasks.find((task) => task.status !== 'DONE' && !task.skippedReason);
  const incomplete = journey.preLitSteps.filter((step) => step.state !== 'done');
  const pending = journey.infoMissing.length > 0 || incomplete.some((step) => step.key !== 'DOCUMENTS') || !!pendingTask;
  const waitingClient = requests.some((r) => r.required && ['REQUESTED', 'MISSING'].includes(r.status));
  const bucket: CaseBucket = ['CLOSED', 'ARCHIVED'].includes(legalCase.status) ? 'CLOSED'
    : pending ? 'TODO' : waitingClient ? 'WAITING_CLIENT' : nextCourtDate ? 'WAITING_COURT' : 'TODO';
  const nextStage = nextJourneyStage(legalCase.stage);
  let next: CaseProgress['next'];
  if (bucket === 'CLOSED') next = null;
  else if (journey.infoMissing.length) next = { kind: 'INFO', text: `เติมข้อมูลคดีให้ครบ (${journey.infoMissing.join(', ')})` };
  else if (incomplete.length) {
    const step = incomplete[0];
    next = { kind: 'PRELIT', text: step.key === 'INFO' ? step.summary ?? step.label : step.label };
  } else if (pendingTask) next = {
    kind: 'TASK', text: pendingTask.title, taskId: pendingTask.id,
    ...(pendingTask.dueDate ? { dueDate: pendingTask.dueDate } : {}),
    ...(pendingTask.assigneeName ? { assigneeName: pendingTask.assigneeName } : {}),
  };
  // Nothing for the firm to do while required documents are still out with the client.
  else if (bucket === 'WAITING_CLIENT') next = { kind: 'WAIT_CLIENT', text: 'รอเอกสารจากลูกความ' };
  else next = nextStage ? { kind: 'ADVANCE', text: `ไปขั้น${CASE_STAGE_LABELS_TH[nextStage]}` } : { kind: 'SET_NEXT', text: 'กำหนดขั้นถัดไป' };
  const stepIndex = journey.steps.findIndex((step) => step.state === 'current');
  return {
    caseId: legalCase.id, bucket, stepIndex, stepTotal: journey.steps.length,
    stepLabel: journey.steps[stepIndex].label,
    done: journey.currentTasks.filter((task) => task.status === 'DONE' || task.skippedReason).length + journey.preLitSteps.filter((step) => step.state === 'done').length,
    total: journey.currentTasks.length + journey.preLitSteps.length,
    next, nextCourtDate,
  };
}
