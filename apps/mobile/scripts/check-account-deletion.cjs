// Exercises the real deletion-screen handlers with mock native and API modules.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
let values = [], cursor = 0, query, confirmation, apiCalls = [], alerts = [], cache = [];
const react = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length ? children : props?.children } }),
  useState: initial => { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; } };
const native = { View: 'view', Pressable: 'press', ScrollView: 'scroll', ActivityIndicator: 'loading',
  Alert: { alert: (...args) => { alerts.push(args); confirmation = args[2]; } }, Linking: { openURL: () => {} }, StyleSheet: { create: s => s } };
function load(file, mocks) {
  const filename = path.join(root, file), mod = new Module(filename); mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename)); const original = mod.require.bind(mod);
  mod.require = name => Object.hasOwn(mocks, name) ? mocks[name] : original(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText, filename);
  return mod.exports;
}
function render(node) {
  if (Array.isArray(node)) return node.flatMap(render);
  if (!node || typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return render(node.type(node.props));
  return [{ ...node, props: { ...node.props, children: render(node.props.children) } }];
}
function flatten(nodes) { return nodes.flatMap(n => n && typeof n === 'object' ? [n, ...flatten(n.props.children)] : [n]); }
class ApiError extends Error { constructor(status) { super('fixture'); this.status = status; } }
const theme = load('src/theme.ts', {});
const mocks = { react, 'react-native': native, 'lucide-react-native': new Proxy({}, { get: (_, k) => `icon:${String(k)}` }),
  '@/components/AppText': { Text: 'text', TextInput: 'input' }, '@/theme': theme,
  '@/components/Form': { FormPage: ({ children }) => children, FormSection: ({ title, children }) => [title, children] },
  '@/api/auth': { useAuth: () => ({ user: { id: 'viewer', email: 'viewer@example.test' } }) },
  '@tanstack/react-query': { useQuery: config => { query.config = config; return query; },
    useQueryClient: () => ({ setQueryData: (key, data) => { cache.push({ key, data }); query.data = data; } }) },
  '@/api/client': { ApiError, api: async (url, options) => { apiCalls.push({ url, options }); if (query.failure) throw new ApiError(query.failure); return { id: 'accepted-request', status: 'PENDING_REVIEW' }; } },
};
mocks['@/components/ui'] = load('src/components/ui.tsx', mocks);
const Screen = load('app/delete-account.tsx', mocks).default;
const fresh = patch => { values = []; query = { data: null, refetch: () => {}, ...patch }; confirmation = null; apiCalls = []; alerts = []; cache = []; };
const tree = () => { cursor = 0; return flatten(render(Screen())); };
const button = rows => rows.find(n => n?.type === 'press' && n.props.accessibilityLabel === 'ส่งคำขอลบบัญชี');
const enter = () => { const rows = tree(); rows.find(n => n?.type === 'input').props.onChangeText('private password'); return tree(); };
(async () => {
  fresh();
  assert.equal(button(tree()).props.disabled, true, 'Empty password cannot submit');
  let rows = enter(); assert.equal(button(rows).props.disabled, false);
  button(rows).props.onPress(); assert.equal(apiCalls.length, 0, 'Opening confirmation must not send a request');
  assert.equal(confirmation[0].style, 'cancel'); assert.equal(confirmation[1].style, 'destructive');
  await confirmation[1].onPress();
  assert.deepEqual(apiCalls, [{ url: '/auth/account/deletion-request', options: { method: 'POST', body: { currentPassword: 'private password' } } }]);
  assert.deepEqual(cache[0].key, ['account-deletion-request', 'viewer']);
  assert.equal(values[0], '', 'Clear password after acceptance');
  rows = tree(); assert.ok(!button(rows), 'Accepted request replaces the form immediately');
  assert.ok(rows.includes('หมายเลข ') && rows.includes('accepted-request'));
  assert.ok(alerts.at(-1)[1].includes('บัญชียังไม่ถูกลบ'));
  fresh({ isLoading: true }); assert.ok(tree().some(n => n?.type === 'loading')); assert.ok(!button(tree()));
  fresh({ isError: true }); rows = tree(); assert.ok(!button(rows)); assert.ok(rows.some(n => typeof n === 'string' && n.includes('โหลดสถานะคำขอไม่สำเร็จ')));
  fresh({ data: { id: 'existing-request' } }); assert.ok(!button(tree()));
  fresh({ isFetching: true }); assert.equal(button(enter()).props.disabled, true);
  fresh({ failure: 401 }); rows = enter(); button(rows).props.onPress(); await confirmation[1].onPress();
  rows = tree(); assert.ok(rows.some(n => typeof n === 'string' && n.includes('รหัสผ่านไม่ถูกต้อง')));
  assert.equal(values[0], 'private password', 'Failed reauthentication keeps the entered password for correction');
  assert.equal(cache.length, 0); assert.equal(values[1], false);
  console.log('PASS: deletion requires password and confirmation, blocks unknown/pending status, sends current-user request, displays acceptance without refetch, preserves retry after failed reauthentication');
})().catch(error => { console.error(error); process.exitCode = 1; });
