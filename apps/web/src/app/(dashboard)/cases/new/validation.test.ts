import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { missingFields } from './validation.ts';

test('case opening validation follows court status and unknown black number', () => {
  const values = { caseTypeId: '', title: ' ', leadLawyerId: '', inCourt: false, courtName: '', blackCaseNumber: '', blackUnknown: false };
  deepStrictEqual(missingFields(values).map((field) => field.id), ['case-type', 'case-title', 'lead-lawyer']);
  deepStrictEqual(missingFields({ ...values, caseTypeId: 'type', title: 'คดี', leadLawyerId: 'lawyer', inCourt: true }).map((field) => field.id), ['court-name', 'black-case-number']);
  deepStrictEqual(missingFields({ ...values, caseTypeId: 'type', title: 'คดี', leadLawyerId: 'lawyer', inCourt: true, courtName: 'ศาล', blackUnknown: true }), []);
});
