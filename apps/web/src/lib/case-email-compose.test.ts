import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_EMAIL_RECIPIENTS,
  appendAddress,
  composeError,
  newSubject,
  parseAddressList,
  replyRecipients,
  replySubject,
} from './case-email-compose.ts';

test('parseAddressList splits on comma, semicolon, whitespace; strips <>; de-dupes case-insensitively', () => {
  assert.deepEqual(parseAddressList(' a@x.com; <b@y.co.th>,\nA@X.com  c@z.com '), ['a@x.com', 'b@y.co.th', 'c@z.com']);
  assert.deepEqual(parseAddressList('   '), []);
});

test('appendAddress adds once', () => {
  assert.equal(appendAddress('', 'a@x.com'), 'a@x.com');
  assert.equal(appendAddress('a@x.com', 'b@x.com'), 'a@x.com, b@x.com');
  assert.equal(appendAddress('A@x.com', 'a@x.com'), 'A@x.com');
});

test('composeError checks recipients, addresses, limit, subject, body — in that order', () => {
  const ok = { to: ['a@x.com'], cc: [], subject: 'เรื่อง', body: 'เนื้อหา' };
  assert.equal(composeError(ok), null);
  assert.equal(composeError({ ...ok, to: [] }), 'กรุณาใส่ผู้รับอย่างน้อย 1 คน');
  assert.equal(composeError({ ...ok, cc: ['Somchai', 'b@'] }), 'อีเมลไม่ถูกต้อง: Somchai, b@');
  const many = Array.from({ length: MAX_EMAIL_RECIPIENTS }, (_, i) => `p${i}@x.com`);
  assert.equal(composeError({ ...ok, cc: many }), 'ผู้รับรวม (ถึง + สำเนา) ได้ไม่เกิน 50 คน');
  assert.equal(composeError({ ...ok, subject: '  ' }), 'กรุณาใส่หัวเรื่อง');
  assert.equal(composeError({ ...ok, body: '\n' }), 'กรุณาใส่เนื้อหา');
});

test('new subject starts with the case Own Ref; reply subject gets one Re:', () => {
  assert.equal(newSubject('TSBREF-0001'), '[TSBREF-0001] ');
  assert.equal(newSubject(''), '');
  assert.equal(replySubject('ขอเอกสาร'), 'Re: ขอเอกสาร');
  assert.equal(replySubject('RE: ขอเอกสาร'), 'RE: ขอเอกสาร');
});

test('replyRecipients: reply goes to the sender; reply-all copies the rest minus me', () => {
  const message = { id: 'm1', fromAddress: 'client@c.com', toAddresses: ['me@firm.com', 'boss@c.com'], ccAddresses: ['Client@c.com', 'aud@c.com'] };
  assert.deepEqual(replyRecipients(message, false, 'me@firm.com'), { to: ['client@c.com'], cc: [] });
  assert.deepEqual(replyRecipients(message, true, 'ME@firm.com'), { to: ['client@c.com'], cc: ['boss@c.com', 'aud@c.com'] });
});

test('replyRecipients: replying to my own sent message goes back to its recipients', () => {
  const sent = { id: 'm2', fromAddress: 'me@firm.com', toAddresses: ['client@c.com'], ccAddresses: ['aud@c.com'] };
  assert.deepEqual(replyRecipients(sent, false, 'me@firm.com'), { to: ['client@c.com'], cc: [] });
  assert.deepEqual(replyRecipients(sent, true, 'me@firm.com'), { to: ['client@c.com'], cc: ['aud@c.com'] });
  assert.deepEqual(replyRecipients({ id: 'm3', fromAddress: null }, false, null), { to: [], cc: [] });
});
