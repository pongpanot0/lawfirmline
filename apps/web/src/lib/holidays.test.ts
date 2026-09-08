import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHolidayLines } from './holidays.ts';

test('reads one holiday per line and keeps the name intact', () => {
  const { error, holidays } = parseHolidayLines(
    '2027-01-01 วันขึ้นปีใหม่\n2027-12-10 วันรัฐธรรมนูญ',
  );
  assert.equal(error, null);
  assert.deepEqual(holidays, [
    { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
    { date: '2027-12-10', name: 'วันรัฐธรรมนูญ' },
  ]);
});

test('accepts a comma or a tab between the date and the name', () => {
  const { holidays } = parseHolidayLines('2027-04-06,วันจักรี\n2027-04-13\tวันสงกรานต์');
  assert.deepEqual(holidays.map((h) => h.name), ['วันจักรี', 'วันสงกรานต์']);
});

test('ignores blank lines and surrounding whitespace', () => {
  const { error, holidays } = parseHolidayLines('\n  2027-01-01 วันขึ้นปีใหม่  \n\n');
  assert.equal(error, null);
  assert.equal(holidays.length, 1);
  assert.equal(holidays[0].name, 'วันขึ้นปีใหม่');
});

test('rejects the whole paste rather than dropping a malformed line', () => {
  const { error, holidays } = parseHolidayLines(
    '2027-01-01 วันขึ้นปีใหม่\n1 ม.ค. 2570 วันขึ้นปีใหม่',
  );
  assert.equal(error, '1 ม.ค. 2570 วันขึ้นปีใหม่');
  assert.deepEqual(holidays, []);
});

test('rejects a date that is not a plain calendar day', () => {
  assert.equal(parseHolidayLines('2027-1-1 วันขึ้นปีใหม่').error, '2027-1-1 วันขึ้นปีใหม่');
});

test('rejects a date with no name after it', () => {
  assert.equal(parseHolidayLines('2027-01-01').error, '2027-01-01');
});
