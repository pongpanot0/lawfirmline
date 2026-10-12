import { DeadlineDayBasis, deadlineRuleKey, effectiveDeadlineRules } from '@lawfirm/shared';
import type { DeadlineRuleItem } from '@lawfirm/shared';

export type RuleOrigin = 'GLOBAL' | 'FIRM' | 'OVERRIDE';

/** What this firm actually runs, and where each row comes from. */
export function firmRuleRows(rules: DeadlineRuleItem[], firmId: string): { rule: DeadlineRuleItem; origin: RuleOrigin }[] {
  const globals = new Set(rules.filter((rule) => rule.firmId === null).map(deadlineRuleKey));
  return effectiveDeadlineRules(rules, firmId).map((rule) => ({
    rule,
    origin: rule.firmId === null ? 'GLOBAL' : globals.has(deadlineRuleKey(rule)) ? 'OVERRIDE' : 'FIRM',
  }));
}

const UNITS = {
  th: { [DeadlineDayBasis.CALENDAR]: 'วัน', [DeadlineDayBasis.BUSINESS]: 'วันทำการ', [DeadlineDayBasis.MONTHS]: 'เดือน', day: 'วัน', before: 'ก่อน' },
  en: { [DeadlineDayBasis.CALENDAR]: 'day(s)', [DeadlineDayBasis.BUSINESS]: 'business day(s)', [DeadlineDayBasis.MONTHS]: 'month(s)', day: 'day(s)', before: 'before:' },
} as const;

export function offsetText(
  rule: Pick<DeadlineRuleItem, 'offsetDays' | 'dayBasis' | 'adjustDays'>,
  locale: 'th' | 'en',
): string {
  const u = UNITS[locale];
  const main = rule.offsetDays < 0
    ? `${u.before} ${Math.abs(rule.offsetDays)} ${u[rule.dayBasis]}`
    : `+${rule.offsetDays} ${u[rule.dayBasis]}`;
  if (!rule.adjustDays) return main;
  return `${main} ${rule.adjustDays < 0 ? '−' : '+'}${Math.abs(rule.adjustDays)} ${u.day}`;
}
