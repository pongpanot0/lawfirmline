import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bangkokDayToIso, litigationPayload } from './case-create.ts';

test('blank litigation fields are left out; the court level always goes', () => {
  assert.deepEqual(
    litigationPayload({ partyRole: '', opponents: [{ name: ' ', role: '', personType: '' }], courtLevel: 'TRIAL', courtName: ' ', blackCaseNumber: '', limitationDeadline: '' }),
    { courtLevel: 'TRIAL' },
  );
});

test('filled fields are trimmed; opponents keep only what was chosen', () => {
  assert.deepEqual(
    litigationPayload({
      partyRole: 'PLAINTIFF',
      opponents: [
        { name: ' บริษัท ข จำกัด ', role: '', personType: 'นิติบุคคล' },
        { name: 'ทนาย ค', role: 'OPPOSING_LAWYER', personType: '' },
      ],
      courtLevel: 'TRIAL',
      courtName: 'ศาลแพ่ง',
      blackCaseNumber: ' พ.123/2569 ',
      limitationDeadline: '2027-03-01',
    }),
    {
      partyRole: 'PLAINTIFF',
      opponents: [
        { name: 'บริษัท ข จำกัด', personType: 'นิติบุคคล' },
        { name: 'ทนาย ค', role: 'OPPOSING_LAWYER' },
      ],
      courtLevel: 'TRIAL',
      courtName: 'ศาลแพ่ง',
      blackCaseNumber: 'พ.123/2569',
      limitationDeadline: '2027-02-28T17:00:00.000Z',
    },
  );
});

test('a date-only value means that Bangkok day', () => {
  assert.equal(bangkokDayToIso('2027-03-01'), '2027-02-28T17:00:00.000Z');
});
