import { test } from 'node:test';
import assert from 'node:assert/strict';
import { participantPayload } from './participants.ts';

const base = { name: 'บริษัท ก', role: 'PLAINTIFF', side: 'OURS', clientId: 'cl-1', representedByParticipantId: 'p-2', phone: '' };

test('blanks become null', () => {
  assert.equal(participantPayload(base).phone, null);
});

test('a client link only on our side; a represented party only for counsel', () => {
  assert.deepEqual(
    [participantPayload(base).clientId, participantPayload(base).representedByParticipantId],
    ['cl-1', null],
  );
  const counsel = participantPayload({ ...base, role: 'OPPOSING_LAWYER', side: 'OPPONENT' });
  assert.deepEqual([counsel.clientId, counsel.representedByParticipantId], [null, 'p-2']);
});
