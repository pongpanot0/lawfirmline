import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from '@lawfirm/shared';

function stubFetch(steps: Array<number | 'error' | 'hang'>) {
  const calls: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit = {}) => {
    calls.push((init.method ?? 'GET').toUpperCase());
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'error') throw new TypeError('Network request failed');
    if (step === 'hang') return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    return new Response('x', { status: step });
  }) as typeof fetch;
  return calls;
}

test('GET retries a deploy 502 and a dropped connection, then succeeds', async () => {
  const calls = stubFetch([502, 'error', 200]);
  const res = await fetchWithRetry('http://x/cases', {}, { delayMs: 1 });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
});

test('GET gives up on a hung request and retries it', async () => {
  const calls = stubFetch(['hang', 200]);
  const res = await fetchWithRetry('http://x/cases', {}, { delayMs: 1, timeoutMs: 20 });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test('GET returns the last 503 after the retries run out', async () => {
  const calls = stubFetch([503]);
  const res = await fetchWithRetry('http://x/cases', {}, { delayMs: 1, retries: 2 });
  assert.equal(res.status, 503);
  assert.equal(calls.length, 3);
});

test('writes and client errors are sent once', async () => {
  let calls = stubFetch([502]);
  assert.equal((await fetchWithRetry('http://x/invoices', { method: 'POST' }, { delayMs: 1 })).status, 502);
  assert.equal(calls.length, 1);
  calls = stubFetch([404]);
  assert.equal((await fetchWithRetry('http://x/cases/1', {}, { delayMs: 1 })).status, 404);
  assert.equal(calls.length, 1);
});
