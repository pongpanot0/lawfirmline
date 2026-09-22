import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caseStageOptions } from './stage-labels.ts';

test('case stages follow the streamlined litigation flow', () => {
  assert.deepEqual(
    caseStageOptions('th').map(({ label }) => label),
    ['รับเรื่อง', 'รวบรวมข้อเท็จจริง', 'ก่อนฟ้อง', 'ยื่นฟ้อง', 'ยื่นคำให้การ', 'ปิดคดี', 'อุทธรณ์', 'ฎีกา'],
  );
});
