import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBackwardStage } from '@lawfirm/shared';
import { caseStageLabel, caseStageOptions } from './stage-labels.ts';

test('case stages follow the litigation flow, closing last', () => {
  assert.deepEqual(
    caseStageOptions('th').map(({ label }) => label),
    ['รวบรวมข้อเท็จจริง', 'ก่อนฟ้อง', 'ยื่นฟ้อง', 'ยื่นคำให้การ', 'ไกล่เกลี่ย', 'สืบพยาน', 'รอคำพิพากษา', 'อุทธรณ์', 'ฎีกา', 'บังคับคดี', 'ปิดคดี'],
  );
});

test('the hidden intake-review alias has its own label', () => {
  assert.equal(caseStageLabel('INTAKE_REVIEW', 'th'), 'รับเรื่อง/ตรวจรับงาน');
  assert.equal(caseStageLabel('INTAKE_REVIEW', 'en'), 'Intake review');
});

test('backward means earlier in CASE_STAGE_ORDER; intake review sorts first', () => {
  assert.equal(isBackwardStage('HEARING', 'FILING'), true);
  assert.equal(isBackwardStage('FILING', 'HEARING'), false);
  assert.equal(isBackwardStage('INTAKE_REVIEW', 'FACT_GATHERING'), false);
  assert.equal(isBackwardStage('FACT_GATHERING', 'INTAKE_REVIEW'), true);
});

test('fact gathering and pre-litigation are one band: no note either way', () => {
  assert.equal(isBackwardStage('PRE_LITIGATION', 'FACT_GATHERING'), false);
  assert.equal(isBackwardStage('FACT_GATHERING', 'PRE_LITIGATION'), false);
  assert.equal(isBackwardStage('FILING', 'FACT_GATHERING'), true);
});
