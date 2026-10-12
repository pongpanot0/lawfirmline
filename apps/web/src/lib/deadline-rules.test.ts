import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeadlineDayBasis, DeadlineTrigger } from '@lawfirm/shared';
import { firmRuleRows, offsetText } from './deadline-rules.ts';

const base = {
  caseTypeId: null, trigger: DeadlineTrigger.COURT_DATE, label: 'สรุปผลนัด', offsetDays: 3,
  dayBasis: DeadlineDayBasis.BUSINESS, adjustDays: 0, courtEventKind: null, courtLevel: null,
  partySide: null, serviceMethod: null, isActive: true,
};

test('firm rows: global, own and override', () => {
  const rows = firmRuleRows(
    [
      { ...base, id: 'g1', firmId: null },
      { ...base, id: 'g2', firmId: null, label: 'ยื่นบัญชีระบุพยาน' },
      { ...base, id: 'f1', firmId: 'firm-1' },
      { ...base, id: 'f2', firmId: 'firm-1', label: 'โทรแจ้งลูกความ' },
    ],
    'firm-1',
  );
  assert.deepEqual(rows.map((r) => [r.rule.id, r.origin]), [['g2', 'GLOBAL'], ['f1', 'OVERRIDE'], ['f2', 'FIRM']]);
});

test('offset text reads naturally for before, months and adjustments', () => {
  assert.equal(offsetText({ offsetDays: -7, dayBasis: DeadlineDayBasis.CALENDAR, adjustDays: 0 }, 'th'), 'ก่อน 7 วัน');
  assert.equal(offsetText({ offsetDays: 3, dayBasis: DeadlineDayBasis.BUSINESS, adjustDays: 0 }, 'th'), '+3 วันทำการ');
  assert.equal(offsetText({ offsetDays: 120, dayBasis: DeadlineDayBasis.MONTHS, adjustDays: -90 }, 'th'), '+120 เดือน −90 วัน');
  assert.equal(offsetText({ offsetDays: 1, dayBasis: DeadlineDayBasis.MONTHS, adjustDays: 0 }, 'en'), '+1 month(s)');
});
