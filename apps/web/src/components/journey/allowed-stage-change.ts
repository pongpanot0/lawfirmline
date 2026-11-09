import { isBackwardStage } from '@lawfirm/shared';

const MAIN_JOURNEY_STAGES = ['PRE_LITIGATION', 'FILING', 'ANSWER', 'MEDIATION', 'HEARING', 'AWAITING_JUDGMENT', 'ENFORCEMENT', 'CLOSING'];
export function allowedStageChange(from: string | null | undefined, to: string) {
  if (!from || from === to || isBackwardStage(from, to)) return true;
  const current = ['INTAKE_REVIEW', 'FACT_GATHERING'].includes(from) ? 'PRE_LITIGATION' : from;
  const destination = ['INTAKE_REVIEW', 'FACT_GATHERING'].includes(to) ? 'PRE_LITIGATION' : to;
  if (current === destination || destination === 'CLOSING') return true;
  if (current === 'AWAITING_JUDGMENT' && destination === 'APPEAL') return true;
  if (current === 'APPEAL' && destination === 'SUPREME') return true;
  const next = ['APPEAL', 'SUPREME'].includes(current) ? 'ENFORCEMENT' : MAIN_JOURNEY_STAGES[MAIN_JOURNEY_STAGES.indexOf(current) + 1];
  return destination === next;
}

