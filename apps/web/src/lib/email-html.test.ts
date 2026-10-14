import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildEmailSrcDoc, sanitizeEmailHtml } from './email-html.ts';

describe('sanitizeEmailHtml', () => {
  it('drops script blocks and inline event handlers', () => {
    const out = sanitizeEmailHtml('<p onclick="steal()">hi</p><script>alert(1)</script><img src="x" onerror=alert(1)>');
    assert.ok(!/script/i.test(out));
    assert.ok(!/onclick|onerror/i.test(out));
    assert.ok(out.includes('<p>hi</p>'));
  });

  it('neutralises javascript: links', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a><a href=\'JavaScript:void(0)\'>y</a>');
    assert.ok(!/javascript:/i.test(out));
  });

  it('removes embedded frames/forms but keeps text formatting and <style>', () => {
    const out = sanitizeEmailHtml(
      '<style>p{color:red}</style><b>ตัวหนา</b><iframe src="https://evil"></iframe><form action="/x"><input name="p"></form>',
    );
    assert.ok(out.includes('<style>p{color:red}</style>'));
    assert.ok(out.includes('<b>ตัวหนา</b>'));
    assert.ok(!/<iframe|<form|<input/i.test(out));
  });
});

describe('buildEmailSrcDoc', () => {
  it('wraps the body with a CSP that blocks scripts and remote content, and opens links in a new tab', () => {
    const doc = buildEmailSrcDoc('<p>สวัสดี</p>');
    assert.ok(doc.includes("default-src 'none'"));
    assert.ok(doc.includes('<base target="_blank">'));
    assert.ok(doc.includes('<p>สวัสดี</p>'));
  });

  it('handles an empty body', () => {
    assert.ok(buildEmailSrcDoc('').includes('<body></body>'));
  });
});
