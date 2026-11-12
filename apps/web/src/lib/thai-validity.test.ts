import assert from 'node:assert/strict';
import { test } from 'node:test';
import { thaiValidityMessage } from './thai-validity.ts';

const field = (over: Record<string, unknown>, validity: Partial<ValidityState>) =>
  ({ tagName: 'INPUT', type: 'text', title: '', minLength: -1, maxLength: -1, min: '', max: '', ...over, validity: validity as ValidityState });

test('gives Thai text for the browser checks people hit most', () => {
  assert.equal(thaiValidityMessage(field({}, { valueMissing: true })), 'กรอกช่องนี้ก่อนไปต่อ');
  assert.equal(thaiValidityMessage(field({ tagName: 'SELECT', type: 'select-one' }, { valueMissing: true })), 'เลือกรายการนี้ก่อนไปต่อ');
  assert.equal(thaiValidityMessage(field({ type: 'email' }, { typeMismatch: true })), 'อีเมลต้องมี @ เช่น name@example.com');
  assert.equal(thaiValidityMessage(field({ title: 'เช่น 081-234-5678' }, { patternMismatch: true })), 'รูปแบบไม่ถูกต้อง — เช่น 081-234-5678');
  assert.equal(thaiValidityMessage(field({ type: 'number', max: '100' }, { rangeOverflow: true })), 'ต้องไม่เกิน 100');
  assert.equal(thaiValidityMessage(field({}, {})), '');
});
