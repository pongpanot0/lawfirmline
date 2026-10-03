// Run: node apps/mobile/scripts/check-offline-session.cjs
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const store = new Map();
const secure = { getItemAsync: async key => store.get(key) ?? null, setItemAsync: async (key, value) => { store.set(key, value); }, deleteItemAsync: async key => { store.delete(key); } };
function load(file, mocks) {
  const filename = path.resolve(__dirname, '../src', file), mod = new Module(filename);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod); mod.require = id => Object.hasOwn(mocks, id) ? mocks[id] : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText, filename);
  return mod.exports;
}
async function main() {
  const client = load('api/client.ts', { 'expo-secure-store': secure });
  const auth = load('api/auth.tsx', { 'expo-secure-store': secure, './client': client, './push': { unregisterPush: async () => {} }, '@react-native-async-storage/async-storage': { default: { getAllKeys: async () => [], multiRemove: async () => {} } }, react: { createContext: () => ({}) } });
  const user = { id: 'user-a', email: 'a@example.test', firmId: 'firm-a', firmRole: 'OWNER' };
  await client.setTokens('token-a', 'refresh-a');
  global.fetch = async () => ({ ok: true, status: 200, json: async () => user });
  assert.deepEqual(await auth.restoreSession(() => assert.fail('no cache yet')), user);
  assert.equal(JSON.parse(store.get(client.USER_PROFILE_KEY)).refreshToken, 'refresh-a');
  let cached;
  global.fetch = async () => { throw Error('offline'); };
  assert.deepEqual(await auth.restoreSession(value => { cached = value; }), user);
  assert.deepEqual(cached, user);
  assert.equal((await client.getTokens()).accessToken, 'token-a');

  // Access-token renewal must not break cold offline recovery of the same session.
  await client.setTokens('token-a-renewed');
  assert.deepEqual(await auth.restoreSession(() => {}), user);
  await client.setTokens('token-a');

  // An old /auth/me response must not overwrite an account opened meanwhile.
  let releaseOld;
  global.fetch = () => new Promise(resolve => { releaseOld = resolve; });
  const oldRestore = auth.restoreSession(() => {});
  while (!releaseOld) await new Promise(resolve => setImmediate(resolve));
  await client.setTokens('token-b', 'refresh-b');
  releaseOld({ ok: true, status: 200, json: async () => user });
  await assert.rejects(oldRestore, /Session changed/);
  assert.equal(JSON.parse(store.get(client.USER_PROFILE_KEY)).refreshToken, 'refresh-a');
  await client.setTokens('token-a', 'refresh-a');

  // Expired access + unavailable refresh is connectivity failure, not a logout.
  global.fetch = async url => {
    if (url.endsWith('/auth/refresh')) throw Error('offline refresh');
    return { ok: false, status: 401, json: async () => ({ message: 'expired' }) };
  };
  assert.deepEqual(await auth.restoreSession(() => {}), user);
  assert.equal((await client.getTokens()).refreshToken, 'refresh-a');
  global.fetch = async url => url.endsWith('/auth/refresh') ? { ok: false, status: 503 } : { ok: false, status: 401, json: async () => ({}) };
  assert.deepEqual(await auth.restoreSession(() => {}), user);
  assert.equal((await client.getTokens()).accessToken, 'token-a');

  // A different token must never open the previous account's cache.
  await client.setTokens('token-b', 'refresh-b');
  global.fetch = async () => { throw Error('offline'); };
  await assert.rejects(auth.restoreSession(() => assert.fail('foreign cached account')));
  assert.equal((await client.getTokens()).accessToken, 'token-b');
  await client.setTokens('token-a', 'refresh-a');
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'invalid session' }) });
  assert.equal(await auth.restoreSession(() => {}), null);
  assert.equal((await client.getTokens()).accessToken, null);
  assert.equal(store.get(client.USER_PROFILE_KEY), undefined);

  await client.setTokens('old', 'refresh');
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/refresh')) return { ok: true, status: 200, json: async () => ({ accessToken: 'renewed' }) };
    return { ok: init.headers.Authorization === 'Bearer renewed', status: init.headers.Authorization === 'Bearer renewed' ? 200 : 401 };
  };
  const body = { test: 'multipart body' };
  assert.equal((await client.authenticatedFetch('/tasks/t/attachments', { method: 'POST', body })).status, 200);
  assert.equal(calls.length, 3); assert.equal(calls[0].init.body, body); assert.equal(calls[2].init.body, body);
  assert.equal(calls[2].init.headers.Authorization, 'Bearer renewed');
  global.fetch = async () => { throw Error('connection lost'); };
  await assert.rejects(client.authenticatedFetch('/tasks/t/attachments', { method: 'POST', body }));
  assert.equal((await client.getTokens()).accessToken, 'renewed');

  const downloads = [], shared = [];
  const files = load('api/files.ts', {
    './client': client, 'expo-file-system': { File: class {} },
    'expo-file-system/legacy': { cacheDirectory: 'file:///cache/', downloadAsync: async (url, target, options) => {
      downloads.push({ url, target, options }); return { status: downloads.length === 1 ? 401 : 200, uri: target };
    } },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async uri => { shared.push(uri); } },
  });
  await client.setTokens('expired-again');
  global.fetch = async url => url.endsWith('/auth/refresh')
    ? { ok: true, status: 200, json: async () => ({ accessToken: 'download-token' }) }
    : { ok: url.endsWith('/auth/me') && (await client.getTokens()).accessToken === 'download-token', status: (await client.getTokens()).accessToken === 'download-token' ? 200 : 401, json: async () => user };
  await files.openTaskAttachment('t', 'a', 'sample.pdf');
  assert.equal(downloads.length, 2); assert.equal(shared.length, 1);
  assert.equal(downloads[1].options.headers.Authorization, 'Bearer download-token');
  console.log('PASS: offline cold session, token renewal/cache isolation, unavailable refresh, invalid-session logout, multipart and PDF token refresh without network replay');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
