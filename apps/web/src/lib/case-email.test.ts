import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultFolderCaseId, emailTimelineItems } from './case-email.ts';

describe('emailTimelineItems', () => {
  it('makes one "อีเมล: {หัวเรื่อง}" item per thread at its latest message, with the sender', () => {
    assert.deepEqual(
      emailTimelineItems([
        { id: 't1', subject: 'ส่งสัญญา', lastMessageAt: '2026-10-13T01:00:00.000Z', fromName: 'คุณเอ', fromAddress: 'a@x.co' },
        { id: 't2', subject: 'นัดหมาย', lastMessageAt: '2026-10-12T01:00:00.000Z', fromName: null, fromAddress: 'b@x.co' },
        { id: 't3', subject: 'ไม่มีผู้ส่ง', lastMessageAt: '2026-10-11T01:00:00.000Z', fromName: null, fromAddress: null },
      ]),
      [
        { id: 'email-t1', label: 'อีเมล: ส่งสัญญา', date: '2026-10-13T01:00:00.000Z', type: 'EMAIL', from: 'คุณเอ' },
        { id: 'email-t2', label: 'อีเมล: นัดหมาย', date: '2026-10-12T01:00:00.000Z', type: 'EMAIL', from: 'b@x.co' },
        { id: 'email-t3', label: 'อีเมล: ไม่มีผู้ส่ง', date: '2026-10-11T01:00:00.000Z', type: 'EMAIL', from: 'ไม่ทราบผู้ส่ง' },
      ],
    );
  });
});

describe('defaultFolderCaseId', () => {
  const s = (caseId: string, reason: 'OWN_REF' | 'CASE_NUMBER' | 'CLIENT_NAME') => ({
    caseId, ownRef: caseId, title: caseId, reason, matchedText: caseId,
  });

  it('pre-selects the only Own Ref / case-number suggestion', () => {
    assert.equal(defaultFolderCaseId({ link: null, suggestions: [s('c1', 'OWN_REF'), s('c2', 'CLIENT_NAME')] }), 'c1');
  });

  it('leaves the choice to the person when strong suggestions disagree or only the client name matched', () => {
    assert.equal(defaultFolderCaseId({ link: null, suggestions: [s('c1', 'OWN_REF'), s('c2', 'CASE_NUMBER')] }), '');
    assert.equal(defaultFolderCaseId({ link: null, suggestions: [s('c2', 'CLIENT_NAME')] }), '');
  });

  it('never pre-selects for an already-linked folder', () => {
    assert.equal(
      defaultFolderCaseId({ link: { id: 'l', caseId: 'c1', ownRef: 'c1', title: 'c1' }, suggestions: [s('c1', 'OWN_REF')] }),
      '',
    );
  });
});
