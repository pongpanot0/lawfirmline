import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./UndoToast.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const requireModule = createRequire(import.meta.url);
const rendererRequire = createRequire(requireModule.resolve('react-dom/server'));
const React = rendererRequire('react');
const { renderToStaticMarkup } = requireModule('react-dom/server');
const exports: Record<string, any> = {};
const load = (id: string) => id === 'react' ? React : id === 'lucide-react' ? { Check: () => null, X: () => null } : id === '@/components/ui/button' ? { Button: (props: any) => React.createElement('button', props) } : requireModule(id);
runInThisContext(`(function(require, exports) { ${compiled}\n})`)(load, exports);

test('undo toast keeps an empty live region before an action and exposes its controls', () => {
  const empty = renderToStaticMarkup(React.createElement(exports.UndoToast, { action: null, onDismiss() {} }));
  assert.match(empty, /role="status"/);
  assert.doesNotMatch(empty, /เลิกทำ/);
  const shown = renderToStaticMarkup(React.createElement(exports.UndoToast, { action: { message: 'ทำเสร็จแล้ว: งาน', detail: 'งานถัดไป: ตรวจ', undo: async () => {} }, onDismiss() {} }));
  assert.match(shown, /ทำเสร็จแล้ว: งาน/);
  assert.match(shown, /งานถัดไป: ตรวจ/);
  assert.match(shown, /เลิกทำ/);
  assert.match(shown, /aria-label="ปิดข้อความ"/);
});
