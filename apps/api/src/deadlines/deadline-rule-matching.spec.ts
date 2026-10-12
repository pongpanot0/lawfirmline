import {
  CourtEventKind,
  DeadlineDayBasis,
  DeadlineRuleItem,
  DEFAULT_DEADLINE_RULES,
  DeadlineTrigger,
  ServiceMethod,
  deadlineRuleApplies,
  effectiveDeadlineRules,
} from '@lawfirm/shared';

const rule = (over: Partial<DeadlineRuleItem>): DeadlineRuleItem => ({
  id: 'r',
  firmId: null,
  caseTypeId: null,
  trigger: DeadlineTrigger.COURT_DATE,
  label: 'สรุปผลนัดและรายงานลูกความ',
  offsetDays: 3,
  dayBasis: DeadlineDayBasis.BUSINESS,
  adjustDays: 0,
  courtEventKind: null,
  courtLevel: null,
  partySide: null,
  serviceMethod: null,
  isActive: true,
  ...over,
});

describe('effectiveDeadlineRules', () => {
  const global = rule({ id: 'g' });
  const other = rule({ id: 'g2', label: 'ยื่นบัญชีระบุพยาน', offsetDays: -7 });

  it('lets a firm rule with the same trigger + label replace the global one for that firm only', () => {
    const override = rule({ id: 'f1', firmId: 'firm-1', offsetDays: 5 });
    const all = [global, other, override];
    expect(effectiveDeadlineRules(all, 'firm-1').map((r) => r.id).sort()).toEqual(['f1', 'g2']);
    expect(effectiveDeadlineRules(all, 'firm-2').map((r) => r.id).sort()).toEqual(['g', 'g2']);
  });

  it('a firm switches a global rule off with an inactive override; other firms keep it', () => {
    const off = rule({ id: 'f1', firmId: 'firm-1', isActive: false });
    const forFirm1 = effectiveDeadlineRules([global, off], 'firm-1').filter((r) => deadlineRuleApplies(r, {}));
    const forFirm2 = effectiveDeadlineRules([global, off], 'firm-2').filter((r) => deadlineRuleApplies(r, {}));
    expect(forFirm1).toEqual([]);
    expect(forFirm2.map((r) => r.id)).toEqual(['g']);
  });

  it('ignores another firm’s rules and whitespace differences in the label', () => {
    const foreign = rule({ id: 'x', firmId: 'firm-2', label: ' สรุปผลนัดและรายงานลูกความ ' });
    expect(effectiveDeadlineRules([global, foreign], 'firm-1').map((r) => r.id)).toEqual(['g']);
    expect(effectiveDeadlineRules([global, foreign], 'firm-2').map((r) => r.id)).toEqual(['x']);
  });
});

describe('deadlineRuleApplies', () => {
  it('a kind-filtered rule fires only for that kind of sitting', () => {
    const witnessList = rule({ courtEventKind: CourtEventKind.WITNESS_HEARING });
    expect(deadlineRuleApplies(witnessList, { courtEventKind: CourtEventKind.WITNESS_HEARING })).toBe(true);
    expect(deadlineRuleApplies(witnessList, { courtEventKind: CourtEventKind.PRELIMINARY })).toBe(false);
    expect(deadlineRuleApplies(witnessList, {})).toBe(false);
    expect(deadlineRuleApplies(rule({}), { courtEventKind: CourtEventKind.PRELIMINARY })).toBe(true);
  });

  it('court level defaults to TRIAL', () => {
    const appeal = rule({ trigger: DeadlineTrigger.JUDGMENT, courtLevel: 'TRIAL' });
    const dika = rule({ trigger: DeadlineTrigger.JUDGMENT, courtLevel: 'APPEAL' });
    expect(deadlineRuleApplies(appeal, {})).toBe(true);
    expect(deadlineRuleApplies(dika, {})).toBe(false);
    expect(deadlineRuleApplies(dika, { courtLevel: 'APPEAL' })).toBe(true);
    expect(deadlineRuleApplies(appeal, { courtLevel: 'APPEAL' })).toBe(false);
  });

  it('a plaintiff-only rule is skipped for a defendant case but kept when the side is unknown', () => {
    const defaultJudgment = rule({ partySide: 'PLAINTIFF' });
    expect(deadlineRuleApplies(defaultJudgment, { partyRole: 'PLAINTIFF' })).toBe(true);
    expect(deadlineRuleApplies(defaultJudgment, { partyRole: 'DEFENDANT' })).toBe(false);
    expect(deadlineRuleApplies(defaultJudgment, { partyRole: null })).toBe(true);
  });

  it('service method: no method means รับเอง', () => {
    const personal = rule({ serviceMethod: ServiceMethod.PERSONAL });
    const posted = rule({ serviceMethod: ServiceMethod.POSTED });
    expect(deadlineRuleApplies(personal, {})).toBe(true);
    expect(deadlineRuleApplies(posted, {})).toBe(false);
    expect(deadlineRuleApplies(posted, { serviceMethod: ServiceMethod.POSTED })).toBe(true);
    expect(deadlineRuleApplies(personal, { serviceMethod: ServiceMethod.POSTED })).toBe(false);
  });

  it('an inactive rule never applies', () => {
    expect(deadlineRuleApplies(rule({ isActive: false }), {})).toBe(false);
  });

  it('the default ม.173 card (FILED) is trial-only: an appeal filing does not raise it', () => {
    const filed = DEFAULT_DEADLINE_RULES.find((r) => r.trigger === DeadlineTrigger.FILED)!;
    const asRow = rule({ ...filed, trigger: DeadlineTrigger.FILED } as Partial<DeadlineRuleItem>);
    expect(deadlineRuleApplies(asRow, { courtLevel: 'TRIAL' })).toBe(true);
    expect(deadlineRuleApplies(asRow, { courtLevel: 'APPEAL' })).toBe(false);
  });
});
