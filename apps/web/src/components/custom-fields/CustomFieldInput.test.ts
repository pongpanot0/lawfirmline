import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./CustomFieldInput.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const requireModule = createRequire(import.meta.url);
const exports: Record<string, any> = {};
runInThisContext(`(function(require, exports) { ${compiled}\n})`)(requireModule, exports);

test('custom field input emits typed values and clears to null', () => {
  for (const [type, input, expected] of [['NUMBER', '12.5', 12.5], ['BOOLEAN', 'false', false], ['TEXT', '', null], ['NUMBER', '', null], ['BOOLEAN', '', null]] as const) {
    let result: unknown = 'unchanged';
    const element = exports.CustomFieldInput({ def: { type, label: 'ทดสอบ', options: [] }, value: null, onChange: (value: unknown) => { result = value; } });
    element.props.onChange({ target: { value: input } });
    assert.equal(result, expected);
  }
});


test('inline input forwards autofocus for every field type', () => {
  for (const type of ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN']) {
    const element = exports.CustomFieldInput({ def: { type, label: 'ทดสอบ', options: [] }, value: null, onChange: () => {}, autoFocus: true });
    assert.equal(element.props.autoFocus, true);
  }
});
