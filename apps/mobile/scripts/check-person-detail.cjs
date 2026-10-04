// Component and navigation regression checks with mock native/query modules; not Android device proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let state = [], cursor = 0;
const react = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length ? children : props?.children } }),
  useCallback: fn => fn, useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; } };
const native = { View: 'view', Pressable: 'press', ScrollView: 'scroll', RefreshControl: 'refresh', ActivityIndicator: 'loading',
  StyleSheet: { create: value => value, hairlineWidth: 1 } };
const icons = new Proxy({}, { get: (_, key) => `icon:${String(key)}` });
function load(file, mocks = {}) {
  const filename = path.join(root, file), mod = new Module(filename);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = id => Object.hasOwn(mocks, id) ? mocks[id] : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText, filename);
  return mod.exports;
}
const theme = load('src/theme.ts');
const common = { react, 'react-native': native, 'lucide-react-native': icons, '@/theme': theme, '@/components/AppText': { Text: 'text' }, '@/format': load('src/format.ts') };
common['@/components/ui'] = load('src/components/ui.tsx', common);
function render(node) {
  if (Array.isArray(node)) return node.flatMap(render);
  if (!node || typeof node !== 'object') return [node];
  if (typeof node.type === 'function') return render(node.type(node.props));
  return [{ ...node, props: { ...node.props, children: render(node.props.children) } }];
}
function flatten(nodes) { return nodes.flatMap(node => node && typeof node === 'object' ? [node, ...flatten(node.props.children)] : [node]); }
const fixture = { userId: 'member', firstName: 'กมล', lastName: 'ใจดี', role: 'LAWYER', workTypes: [],
  tasks: [{ id: 'private', title: 'งานที่คุณไม่มีสิทธิ์ดู', case: null, overdue: false, status: 'TODO' }, { id: 'visible', title: 'งานคดีที่เข้าถึงได้', case: { id: 'case', ownRef: 'REF', title: 'คดี' }, overdue: true, status: 'IN_PROGRESS' }],
  reviews: [{ id: 'review-private', title: 'งานที่คุณไม่มีสิทธิ์ดู' }], cases: [{ id: 'case', ownRef: 'REF', title: 'คดี', role: 'BUDDY' }],
  events: [{ id: 'event-private', title: 'ติดนัด', startAt: '2026-10-05T02:00:00Z' }, { id: 'event', title: 'นัดที่เปิดได้', startAt: '2026-10-06T02:00:00Z' }],
  leaves: [], hiddenCaseCount: 1 };
const { PersonWorkloadView } = load('src/components/PersonWorkloadView.tsx', common);
const opened = [], props = { person: fixture, from: '2026-10-04', viewerId: 'colleague', owner: false,
  onTask: id => opened.push(['task', id]), onCase: id => opened.push(['case', id]), onEvent: id => opened.push(['event', id]) };
let rows = flatten(render(react.createElement(PersonWorkloadView, props)));
assert.equal(rows.filter(n => n?.type === 'press').length, 3, 'Private tasks/reviews/events must be plain rows');
for (const row of rows.filter(n => n?.type === 'press')) row.props.onPress();
assert.deepEqual(opened, [['task', 'visible'], ['event', 'event'], ['case', 'case']]);
rows = flatten(render(react.createElement(PersonWorkloadView, { ...props, viewerId: 'member' })));
assert.equal(rows.filter(n => n?.type === 'press').length, 6, 'Self can open own work');
rows = flatten(render(react.createElement(PersonWorkloadView, { ...props, owner: true })));
assert.equal(rows.filter(n => n?.type === 'press').length, 6, 'Owner can open returned work');
rows = flatten(render(react.createElement(PersonWorkloadView, { ...props, person: { ...fixture, tasks: [], cases: [], reviews: [], events: [], leaves: [] } })));
assert.ok(rows.includes('ไม่มีงานค้างในคิวที่บันทึกไว้')); assert.ok(rows.includes('ไม่มีนัดในช่วง 7 วันนี้'));

const configs = [], apiCalls = [];
const hooks = load('src/api/hooks.ts', { '@tanstack/react-query': { useQuery: config => { configs.push(config); return config; } },
  './client': { api: url => { apiCalls.push(url); } }, '../format': common['@/format'] });
hooks.usePersonWorkload('person/a?b', '2026-10-04'); configs.at(-1).queryFn();
assert.deepEqual(configs.at(-1).queryKey, ['person-workload', 'person/a?b', '2026-10-04']);
assert.equal(apiCalls.at(-1), '/operations/people/person%2Fa%3Fb?from=2026-10-04');
hooks.usePersonWorkload('', '2026-10-04'); assert.equal(configs.at(-1).enabled, false);
let params = { id: 'member', from: '2026-10-05' }, received, queryState = { data: fixture, refetch: () => {}, isRefetching: false };
const routes = [], router = { push: route => routes.push(route) };
const screen = load('app/person/[id].tsx', { ...common, '@/components/PersonWorkloadView': { PersonWorkloadView },
  '@/api/auth': { useAuth: () => ({ user: { id: 'owner', firmRole: 'OWNER' } }) },
  '@/api/hooks': { usePersonWorkload: (id, from) => { received = [id, from]; return queryState; } },
  'expo-router': { Stack: { Screen: 'stack' }, useRouter: () => router, useLocalSearchParams: () => params, useFocusEffect: () => {} } });
rows = flatten(render(screen.default())); assert.deepEqual(received, ['member', '2026-10-05']);
rows.find(n => n?.props?.accessibilityLabel === 'เปิด งานคดีที่เข้าถึงได้').props.onPress();
assert.deepEqual(routes.at(-1), { pathname: '/task/new', params: { id: 'visible' } });
rows.find(n => n?.props?.accessibilityLabel === 'เปิด คดี').props.onPress();
assert.deepEqual(routes.at(-1), { pathname: '/case/[id]', params: { id: 'case' } });
rows.find(n => n?.props?.accessibilityLabel === 'เปิด นัดที่เปิดได้').props.onPress();
assert.deepEqual(routes.at(-1), { pathname: '/event/[id]/team', params: { id: 'event' } });
rows.find(n => n?.props?.accessibilityLabel === 'มอบหมายงาน').props.onPress();
assert.deepEqual(routes.at(-1), { pathname: '/task/new', params: { assigneeId: 'member' } });
queryState = { isLoading: true, refetch: () => {} }; assert.ok(flatten(render(screen.default())).some(n => n?.type === 'loading'));
queryState = { isError: true, refetch: () => {} }; assert.ok(flatten(render(screen.default())).some(n => typeof n === 'string' && n.includes('โหลดรายละเอียดสมาชิกไม่ได้')));
params = {}; assert.ok(flatten(render(screen.default())).some(n => typeof n === 'string' && n.includes('ไม่พบสมาชิก')));

const { Disclosure } = load('src/components/Disclosure.tsx', common);
state = []; cursor = 0;
rows = flatten(render(react.createElement(Disclosure, { title: 'รายละเอียด', children: 'content' })));
assert.ok(!rows.includes('content')); rows.find(n => n?.type === 'press').props.onPress(); cursor = 0;
rows = flatten(render(react.createElement(Disclosure, { title: 'รายละเอียด', children: 'content' })));
assert.ok(rows.includes('content')); assert.equal(rows.find(n => n?.type === 'press').props.accessibilityState.expanded, true);

const luminance = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
for (const [fg, bg] of [['faint','bg'], ['faint','surface'], ['muted','soft'], ['ink','surface'], ['surface','ink'], ['info','infoSoft'], ['warn','warnSoft'], ['accentInk','accentSoft'], ['good','goodSoft']]) {
  const a = luminance(theme.colors[fg]), b = luminance(theme.colors[bg]);
  assert.ok((Math.max(a,b) + .05) / (Math.min(a,b) + .05) >= 4.5, `${fg}/${bg} must pass body-text contrast`);
}
console.log('PASS: person detail routes, selected ID/date query, redacted work stays closed, owner/self access, empty/loading/error states, disclosure behavior, semantic text contrast');
