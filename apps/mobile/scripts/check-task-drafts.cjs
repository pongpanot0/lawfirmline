// Run: node apps/mobile/scripts/check-task-drafts.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const storage = new Map(), disk = new Map();
let failCopy = false, failWrite = false;
const mockStorage = {
  getItem: async key => storage.get(key) ?? null,
  setItem: async (key, text) => { if (failWrite) { failWrite = false; throw Error('storage full'); } storage.set(key, text); },
  removeItem: async key => { storage.delete(key); },
  getAllKeys: async () => [...storage.keys()],
  multiGet: async keys => keys.map(key => [key, storage.get(key) ?? null]),
};
const mockFiles = {
  documentDirectory: 'file:///documents/', makeDirectoryAsync: async () => {},
  copyAsync: async ({ from, to }) => { if (failCopy || !disk.has(from)) throw Error('copy failed'); disk.set(to, disk.get(from)); },
  getInfoAsync: async uri => ({ exists: disk.has(uri) }),
  readDirectoryAsync: async dir => [...disk.keys()].filter(uri => uri.startsWith(dir)).map(uri => uri.slice(dir.length)),
  deleteAsync: async uri => { for (const key of [...disk.keys()]) if (key === uri || key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) disk.delete(key); },
};
function load() {
  const filename = path.resolve(__dirname, '../src/api/drafts.ts'), mod = new Module(filename);
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod.require = id => ({ '@react-native-async-storage/async-storage': mockStorage, 'expo-file-system/legacy': mockFiles })[id];
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
async function main() {
  let drafts = load();
  const user = { id: 'owner', firmId: 'firm-a', firmRole: 'OWNER' };
  const scope = drafts.taskDraftScope(user), key = `${scope}form:new`;
  const otherScope = drafts.taskDraftScope({ ...user, id: 'other' });
  assert.notEqual(scope, otherScope);
  assert.notEqual(scope, drafts.taskDraftScope({ ...user, firmId: 'firm-b' }));
  assert.notEqual(scope, drafts.taskDraftScope({ ...user, firmRole: 'ASSISTANT' }));
  const meta = { name: 'งานทดสอบ', route: '/task/new' };
  disk.set('file:///cache/source.pdf', 'source bytes');
  const data = { title: 'ข้อความยังไม่ส่ง', files: [{ uri: 'file:///cache/source.pdf', name: 'ต้นฉบับ.pdf', mimeType: 'application/pdf' }], requestSnapshot: { createRequestId: 'request-1', title: 'ข้อความเดิม' }, savedId: null };
  await drafts.saveTaskDraft(key, data, meta);
  const original = await drafts.loadTaskDraft(key);
  assert.equal(disk.get(original.data.files[0].uri), 'source bytes');
  assert.ok(original.data.files[0].uri.startsWith('file:///documents/task-drafts/'));
  disk.delete('file:///cache/source.pdf'); drafts = load(); // simulate a cold process after picker cache eviction
  const restored = await drafts.loadTaskDraft(key);
  assert.equal(restored.data.title, data.title);
  assert.deepEqual(restored.data.requestSnapshot, data.requestSnapshot);
  assert.equal(restored.missingFiles.length, 0);
  assert.equal((await drafts.listTaskDrafts(otherScope)).length, 0);

  const first = drafts.saveTaskDraft(key, { ...restored.data, title: 'first' }, meta);
  const last = drafts.saveTaskDraft(key, { ...restored.data, title: 'last' }, meta);
  await Promise.all([first, last]);
  assert.equal((await drafts.loadTaskDraft(key)).data.title, 'last');
  failWrite = true;
  await assert.rejects(drafts.saveTaskDraft(key, { ...restored.data, title: 'unsaved newest' }, meta));
  assert.equal((await drafts.loadTaskDraft(key)).data.title, 'last');
  await drafts.saveTaskDraft(key, { ...restored.data, title: 'retry newest' }, meta);
  assert.equal((await drafts.loadTaskDraft(key)).data.title, 'retry newest');

  disk.set('file:///cache/another.pdf', 'new bytes'); failCopy = true;
  await assert.rejects(drafts.saveTaskDraft(key, { ...data, title: 'must not replace', files: [{ ...data.files[0], uri: 'file:///cache/another.pdf' }] }, meta));
  failCopy = false;
  assert.equal((await drafts.loadTaskDraft(key)).data.title, 'retry newest');
  const foreignKey = `${otherScope}form:new`;
  await drafts.saveTaskDraft(foreignKey, { title: 'other user', files: [] }, meta);
  assert.equal((await drafts.listTaskDrafts(scope)).length, 1);
  const record = JSON.parse(storage.get(key));
  storage.set(key, JSON.stringify({ ...record, data: { ...record.data, files: [{ ...record.data.files[0], uri: 'file:///documents/other-user.pdf' }] } }));
  await assert.rejects(drafts.loadTaskDraft(key), /ไฟล์ในร่างไม่ถูกต้อง/);
  storage.set(key, JSON.stringify(record));
  disk.delete(record.data.files[0].uri);
  const missing = await drafts.loadTaskDraft(key);
  assert.deepEqual(missing.missingFiles, ['ต้นฉบับ.pdf']); assert.equal(missing.data.files.length, 0);

  await Promise.all([drafts.saveTaskDraft(key, { title: 'pending', files: [] }, meta), drafts.removeTaskDraft(key)]);
  assert.equal(await drafts.loadTaskDraft(key), null); // deletion cannot race an older queued save
  assert.equal((await drafts.listTaskDrafts(otherScope)).length, 1);
  storage.set(key, '{invalid JSON');
  await assert.rejects(drafts.loadTaskDraft(key));
  console.log('PASS: cold recovery, durable file bytes, account/firm/role isolation, ordered writes/removal, failed save/copy, missing/foreign files and creation request recovery');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
