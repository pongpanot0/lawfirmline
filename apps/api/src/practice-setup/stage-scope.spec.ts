import { CaseStage } from '@lawfirm/shared';
import { stagesToApply, stepMatchesSide, stepTaskTitle } from './stage-scope';

describe('stage scope', () => {
  it('current and next stage in CASE_STAGE_ORDER', () => {
    expect(stagesToApply(CaseStage.FILING)).toEqual([CaseStage.FILING, CaseStage.ANSWER]);
    expect(stagesToApply(CaseStage.AWAITING_JUDGMENT)).toEqual([CaseStage.AWAITING_JUDGMENT, CaseStage.APPEAL]);
  });

  it('the last stage has no next', () => {
    expect(stagesToApply(CaseStage.CLOSING)).toEqual([CaseStage.CLOSING]);
  });

  it('a stage outside the order (legacy INTAKE_REVIEW) or none starts at the first stage', () => {
    expect(stagesToApply(CaseStage.INTAKE_REVIEW)).toEqual([CaseStage.INTAKE_REVIEW, CaseStage.FACT_GATHERING]);
    expect(stagesToApply(null)).toEqual([CaseStage.FACT_GATHERING]);
  });

  it('side filter: untagged always, tagged only on our side, both when our side is unknown', () => {
    expect(stepMatchesSide({}, 'PLAINTIFF')).toBe(true);
    expect(stepMatchesSide({ side: 'DEFENDANT' }, 'PLAINTIFF')).toBe(false);
    expect(stepMatchesSide({ side: 'PLAINTIFF' }, 'PLAINTIFF')).toBe(true);
    expect(stepMatchesSide({ side: 'DEFENDANT' }, null)).toBe(true);
  });

  it('marks a sided step "(ถ้าเป็นฝ่าย…)" only when our side is unknown and the title does not already say so', () => {
    expect(stepTaskTitle({ title: 'ยื่นคำร้องขอปล่อยชั่วคราว', side: 'DEFENDANT' }, null)).toBe('ยื่นคำร้องขอปล่อยชั่วคราว (ถ้าเป็นฝ่ายจำเลย)');
    expect(stepTaskTitle({ title: 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)', side: 'DEFENDANT' }, null)).toBe('ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)');
    expect(stepTaskTitle({ title: 'ยื่นคำร้องขอปล่อยชั่วคราว', side: 'DEFENDANT' }, 'DEFENDANT')).toBe('ยื่นคำร้องขอปล่อยชั่วคราว');
  });
});
