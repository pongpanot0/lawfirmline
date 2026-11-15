import { CASE_STAGE_LABELS_TH, CaseStage } from '@lawfirm/shared';

/** The main path a case walks; APPEAL and SUPREME branch off after judgment and count as that step. */
export const MAIN_PATH = [CaseStage.INTAKE_REVIEW, CaseStage.FACT_GATHERING, CaseStage.PRE_LITIGATION, CaseStage.FILING, CaseStage.ANSWER,
  CaseStage.MEDIATION, CaseStage.HEARING, CaseStage.AWAITING_JUDGMENT, CaseStage.ENFORCEMENT, CaseStage.CLOSING];

/** Step n of MAIN_PATH (1-based) for a stage, its label and the next step's label; null when the stage is unknown. */
export function stageStep(stage: string | null | undefined) {
  if (!stage) return null;
  const branch = stage === CaseStage.APPEAL || stage === CaseStage.SUPREME;
  const index = branch ? MAIN_PATH.indexOf(CaseStage.AWAITING_JUDGMENT) : MAIN_PATH.indexOf(stage as CaseStage);
  if (index < 0) return null;
  return {
    index,
    step: index + 1,
    total: MAIN_PATH.length,
    label: CASE_STAGE_LABELS_TH[stage as CaseStage] ?? stage,
    next: !branch && index < MAIN_PATH.length - 1 ? CASE_STAGE_LABELS_TH[MAIN_PATH[index + 1]] : null,
  };
}
