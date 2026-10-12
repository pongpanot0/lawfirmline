import { CASE_STAGE_ORDER, CaseStage, PlaybookSide } from '@lawfirm/shared';

/** "Apply whole SOP" creates the current stage and the next; later stages come through the stage-change proposal. */
export function stagesToApply(stage: string | null | undefined): CaseStage[] {
  const index = CASE_STAGE_ORDER.indexOf(stage as CaseStage);
  if (index === -1) return [...(stage ? [stage as CaseStage] : []), CASE_STAGE_ORDER[0]];
  return CASE_STAGE_ORDER.slice(index, index + 2);
}

export function stepMatchesSide(step: { side?: PlaybookSide }, side: PlaybookSide | null): boolean {
  return !step.side || !side || step.side === side;
}

const SIDE_LABEL: Record<PlaybookSide, string> = { PLAINTIFF: 'โจทก์', DEFENDANT: 'จำเลย' };

/** With our side unknown, both sides' steps are created; a sided title says which side it is for. */
export function stepTaskTitle(step: { title: string; side?: PlaybookSide }, side: PlaybookSide | null): string {
  const title = step.title.trim();
  if (!step.side || side || title.includes('ฝ่าย')) return title;
  return `${title} (ถ้าเป็นฝ่าย${SIDE_LABEL[step.side]})`;
}
