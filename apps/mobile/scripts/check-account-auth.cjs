// Local mocked API/session checks; this does not replace testing an Android build.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src', file), mod = new Module(filename);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = id => Object.hasOwn(mocks, id) ? mocks[id] : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText, filename);
  return mod.exports;
}

async function main() {
  const validation = load('account-validation.ts');
  for (const [text, bytes] of [['a'.repeat(72), 72], ['ก'.repeat(24), 72], ['😀'.repeat(18), 72]]) {
    assert.equal(validation.passwordByteLength(text), bytes);
    assert.equal(validation.passwordError(text, text), null);
  }
  for (const password of ['short', 'ก'.repeat(25), '😀'.repeat(19)]) assert.ok(validation.passwordError(password, password));
  assert.ok(validation.passwordError('valid-secret', 'different-secret'));

  const state = [], cache = new Map(), calls = [], writes = [];
  let cursor = 0, tokens = { accessToken: null, refreshToken: null }, response, cacheHook;
  const react = { createContext: () => ({ Provider: 'provider' }), useEffect: () => {}, useCallback: fn => fn,
    useMemo: fn => fn(), useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    createElement: (_, props) => props };
  const client = { USER_PROFILE_KEY: 'profile', ApiError: class extends Error {}, getTokens: async () => ({ ...tokens }),
    setTokens: async (accessToken, refreshToken) => { tokens = { accessToken, refreshToken }; writes.push({ ...tokens }); },
    clearTokens: async () => { tokens = { accessToken: null, refreshToken: null }; },
    api: async (url, options) => { calls.push({ url, options }); if (response instanceof Error) throw response; return response; } };
  const auth = load('api/auth.tsx', { react, './client': client, './push': { unregisterPush: async () => {} },
    'expo-secure-store': { setItemAsync: async (key, value) => { cache.set(key, value); if (cacheHook) await cacheHook(); } },
    '@react-native-async-storage/async-storage': { getAllKeys: async () => [], multiRemove: async () => {} } });
  const render = () => { cursor = 0; return auth.AuthProvider({ children: null }).value; };
  const user = { id: 'self', email: 'a@example.test', firstName: 'A', lastName: 'B' };
  let context = render();
  response = { mfaRequired: true, mfaToken: 'challenge' };
  assert.deepEqual(await context.login(' A@EXAMPLE.TEST ', 'secret'), response);
  assert.equal(writes.length, 0); assert.equal(state[1], null);
  assert.equal(calls.at(-1).options.body.email, 'a@example.test');
  response = { accessToken: 'access', refreshToken: 'refresh', user };
  await context.verifyMfa('challenge', '123456');
  assert.equal(calls.at(-1).url, '/auth/mfa/verify');
  assert.deepEqual(state[1], user);
  assert.equal(JSON.parse(cache.get('profile')).refreshToken, 'refresh');
  context = render();
  const signup = { firmName: 'Office', firstName: 'A', lastName: 'B', email: user.email, password: 'new-secret' };
  await context.register(signup);
  assert.equal(calls.at(-1).url, '/auth/register'); assert.deepEqual(calls.at(-1).options.body, signup);
  response = Error('Email already exists');
  const previousWrites = writes.length;
  await assert.rejects(context.register(signup)); assert.equal(writes.length, previousWrites);
  response = { ...user, firstName: 'Updated' };
  await context.refreshUser(); assert.equal(state[1].firstName, 'Updated');
  cacheHook = async () => { tokens = { accessToken: 'other', refreshToken: 'other-refresh' }; };
  await assert.rejects(context.refreshUser(), /Session changed/);
  assert.equal(state[1].firstName, 'Updated');
  console.log('PASS: UTF-8 password limits, MFA token isolation, registration success/failure, profile session race');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
