import assert from 'node:assert/strict';
import { test } from 'node:test';
import { secretaryCardPath, secretaryMessages } from './secretary.ts';

test('secretary sends only the last ten messages without card data', () => {
  const history = Array.from({ length: 25 }, (_, i) => ({
    role: i % 2 ? 'assistant' : 'user', content: `turn ${i}`, cards: [],
  }));
  const result = secretaryMessages(history);
  assert.equal(result.length, 10);
  assert.deepEqual(result[0], { role: 'assistant', content: 'turn 15' });
  assert.deepEqual(result.at(-1), { role: 'user', content: 'turn 24' });
  assert.equal(history.length, 25);
});

test('secretary rejects empty history, an assistant last turn and blank user input', () => {
  assert.throws(() => secretaryMessages([]));
  assert.throws(() => secretaryMessages([{ role: 'assistant', content: 'hello' }]));
  assert.throws(() => secretaryMessages([{ role: 'user', content: '  ' }]));
  assert.deepEqual(secretaryMessages([{ role: 'user', content: 'สรุปคดี' }]), [{ role: 'user', content: 'สรุปคดี' }]);
});

test('secretary links keep the entity kind and never invent a document destination', () => {
  assert.equal(secretaryCardPath({ type: 'case', id: 'c1', title: 'คดี', ownRef: null }), '/case/c1');
  assert.equal(secretaryCardPath({ type: 'intake', id: 'i1', title: 'รับเรื่อง' }), '/intake/i1');
  assert.equal(secretaryCardPath({ type: 'event', id: 'e1', caseId: 'c1', title: 'นัด', startAt: '' }), '/event/e1');
  assert.equal(secretaryCardPath({ type: 'document', id: 'd1', caseId: null, filename: 'a.pdf' }), null);
});
