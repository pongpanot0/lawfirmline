import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

// Keep native dependencies at the boundary; run the actual client, upload and query functions.
function load(path, imports, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, { exports, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
    return imports[name];
  }, process, AbortController, setTimeout, clearTimeout, __DEV__: false, ...globals });
  return exports;
}

function setup({ size = 128, response = { text: 'สรุปคดีให้หน่อย' }, status = 200 } = {}) {
  const requests = [];
  const deleted = [];
  const client = load('./client.ts', { 'expo-secure-store': { getItemAsync: async () => 'token' } }, {
    fetch: async (url, init) => {
      requests.push({ url, ...init });
      return new Response(JSON.stringify(response), { status });
    },
  });
  const files = load('./files.ts', {
    './client': client, 'expo-file-system/legacy': {}, 'expo-sharing': {},
    'expo-file-system': { File: class {
      exists = true;
      size = size;
      constructor(uri) { this.uri = uri; }
      bytes() { return new Uint8Array([1, 2, 3]); }
      delete() { this.exists = false; deleted.push(this.uri); }
    } },
  }, { FormData: class { parts = []; append(...part) { this.parts.push(part); } } });
  const secretary = load('../lib/secretary.ts', {});
  const hooks = load('./hooks.ts', {
    './client': client, './files': files, '../lib/secretary': secretary, '../format': {},
    '@tanstack/react-query': { useMutation: options => options, useQuery: options => options },
  });
  return { requests, deleted, files, hooks };
}

test('voice uses the authenticated multipart audio field and deletes the temporary file', async () => {
  const { files, requests, deleted } = setup();
  const result = await files.transcribeSecretaryAudio('file:///voice.m4a');
  assert.equal(result.text, 'สรุปคดีให้หน่อย');
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith('/ai/secretary/transcribe'));
  assert.equal(requests[0].headers.Authorization, 'Bearer token');
  assert.equal(requests[0].headers['Content-Type'], undefined);
  assert.equal(requests[0].body.parts[0][0], 'audio');
  assert.equal(requests[0].body.parts[0][1].type, 'audio/mp4');
  assert.deepEqual([...await requests[0].body.parts[0][1].bytes()], [1, 2, 3]);
  assert.deepEqual(deleted, ['file:///voice.m4a']);
});

test('empty and oversized recordings are rejected before upload and cleaned up', async () => {
  for (const size of [0, 10 * 1024 * 1024 + 1]) {
    const { files, requests, deleted } = setup({ size });
    await assert.rejects(() => files.transcribeSecretaryAudio('file:///voice.m4a'));
    assert.equal(requests.length, 0);
    assert.deepEqual(deleted, ['file:///voice.m4a']);
  }
});

test('AI failure and credit messages survive both chat and transcription', async () => {
  for (const [status, message] of [[502, 'เลขาไม่พร้อมใช้งาน กรุณาลองใหม่'], [402, 'Insufficient AI credits']]) {
    const { files, hooks, deleted } = setup({ status, response: { message } });
    await assert.rejects(() => files.transcribeSecretaryAudio('file:///voice.m4a'), error => error.message === message);
    await assert.rejects(() => hooks.useSecretaryChat().mutationFn([{ role: 'user', content: 'สรุปคดี' }]), error => error.message === message);
    assert.deepEqual(deleted, ['file:///voice.m4a']);
    assert.equal(hooks.useSecretaryChat().retry, false);
    assert.equal(hooks.useTranscribe().retry, false);
  }
});

test('brief 404 is empty, access denial stays an error, and owner queries can be disabled', async () => {
  const missing = setup({ status: 404, response: { message: 'Not found' } });
  assert.equal(await missing.hooks.useDailyBrief('2026-10-31').queryFn(), null);
  assert.ok(missing.requests[0].url.endsWith('/ai/daily-brief?date=2026-10-31'));
  assert.equal(missing.hooks.useDailyBrief(undefined, false).enabled, false);
  assert.equal(missing.hooks.useDailyBriefDates(false).enabled, false);
  const forbidden = setup({ status: 403, response: { message: 'Forbidden' } });
  await assert.rejects(() => forbidden.hooks.useDailyBrief().queryFn(), error => error.status === 403);
  await assert.rejects(() => forbidden.hooks.useCaseBrief('c1').queryFn(), error => error.status === 403);
});
