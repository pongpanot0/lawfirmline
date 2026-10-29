import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailPreview, senderInitials, splitQuotedHtml, splitQuotedText } from '@lawfirm/shared';

test('hides the Outlook "From: … Sent: …" history under the new text', () => {
  const body = 'รับทราบครับ\n\n\n\nChannarong\n\nFrom: Tharadol <t@allianz.co.th>\nSent: Tuesday, October 6, 2026 2:46 PM\nTo: Channarong\nSubject: RE: x\n\nold text';
  const { main, quoted } = splitQuotedText(body);
  assert.equal(main, 'รับทราบครับ\n\nChannarong');
  assert.match(quoted ?? '', /^From: Tharadol/);
});

test('Thai Outlook headers and Gmail "wrote:" lines are separators too', () => {
  assert.equal(splitQuotedText('ok\nจาก: A\nส่ง: วันอังคาร\nold').main, 'ok');
  assert.equal(splitQuotedText('ok\nOn Tue, 6 Oct 2026, A <a@x.com> wrote:\n> old').main, 'ok');
});

test('a mail with no quote, or only a quote, is shown in full', () => {
  assert.deepEqual(splitQuotedText('hello'), { main: 'hello', quoted: null });
  assert.equal(splitQuotedText('From: A\nSent: B\nbody').quoted, null);
});

test('cuts Outlook HTML at the reply divider', () => {
  const { main, quoted } = splitQuotedHtml('<p>new</p><hr style="display:inline-block;width:98%"><div id="divRplyFwdMsg">old</div>');
  assert.equal(main, '<p>new</p>');
  assert.match(quoted ?? '', /^<hr/);
  assert.equal(splitQuotedHtml('<div id="appendonsend"></div><p>old</p>').quoted, null);
});

test('preview and initials', () => {
  assert.equal(emailPreview('Hi  team\n\nsee below\nFrom: A\nSent: B'), 'Hi team see below');
  assert.equal(senderInitials('Varat Thuraharn', null), 'VT');
  assert.equal(senderInitials(null, 'varat@siambarristers.com'), 'VS');
});
