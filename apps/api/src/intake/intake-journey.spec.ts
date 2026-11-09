import { intakeJourney } from './intake-journey';

const intake: Parameters<typeof intakeJourney>[0] = { title: 'เรื่อง', clientId: 'client', clientName: null, decision: 'FILE_SUIT', status: 'CONVERTED', noticeIssuedAt: null, preLitigationStatus: 'NOT_STARTED' };
const clear = { result: 'CLEAR' };
const states = (input = intake, conflict: { result: string } | null = clear, requests: { required: boolean; status: string }[] = []) => intakeJourney(input, conflict, requests).steps.map((s) => s.state);

describe('intakeJourney', () => {
  it('completes all six steps and has no next action or blockers', () => {
    const result = intakeJourney(intake, clear, []);
    expect(result.steps.map((s) => s.key)).toEqual(['INFO', 'CONFLICT', 'DOCUMENTS', 'DECISION', 'ACTION', 'CLOSE']);
    expect(result.steps.every((s) => s.state === 'done' && s.summary)).toBe(true);
    expect(result).toMatchObject({ canAdvance: true, blockers: [], next: null });
  });
  it.each([
    { title: null }, { title: '  ' }, { clientId: null, clientName: null }, { clientId: null, clientName: '  ' },
  ])('requires title and client information: %j', (patch) => {
    expect(states({ ...intake, ...patch })).toEqual(['current', 'locked', 'locked', 'locked', 'locked', 'locked']);
  });
  it('accepts clientName without clientId', () => {
    expect(states({ ...intake, clientId: null, clientName: 'ลูกความ' })[0]).toBe('done');
  });
  it.each([null, { result: 'NEEDS_REVIEW' }])('requires a resolved latest conflict result %j', (conflict) => {
    const result = intakeJourney(intake, conflict, []);
    expect(result.steps.map((s) => s.state)).toEqual(['done', 'current', 'locked', 'locked', 'locked', 'locked']);
    expect(result.steps[0].summary).toBeTruthy();
    expect(result.steps[2].unlockHint).toContain('ปลดล็อก');
    expect(result.canAdvance).toBe(false);
    expect(result.blockers).toEqual([result.next!.text]);
  });
  it.each(['CLEAR', 'POTENTIAL_CONFLICT', 'CONFLICT'])('accepts non-review conflict result %s', (result) => {
    expect(states(intake, { result })[1]).toBe('done');
  });
  it.each(['REQUESTED', 'MISSING'])('blocks required %s documents and reports exact progress', (status) => {
    const result = intakeJourney(intake, clear, [{ required: true, status }, { required: true, status: 'RECEIVED' }, { required: true, status: 'NOT_APPLICABLE' }, { required: false, status: 'MISSING' }]);
    expect(result.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'locked', 'locked', 'locked']);
    expect(result.next).toMatchObject({ done: 2, total: 3 });
    expect(result.next!.text).toContain('2 จาก 3');
  });
  it.each([
    { requests: [] },
    { requests: [{ required: true, status: 'RECEIVED' }] },
    { requests: [{ required: true, status: 'NOT_APPLICABLE' }] },
    { requests: [{ required: false, status: 'REQUESTED' }] },
  ])('accepts resolved/optional/zero documents: %j', ({ requests }) => {
    expect(states(intake, clear, requests)[2]).toBe('done');
  });
  it('completes a consultation-only intake saved as CONSULTED', () => {
    expect(intakeJourney({ ...intake, decision: 'CONSULTATION_ONLY', status: 'CONSULTED' }, clear, [])).toMatchObject({ canAdvance: true, blockers: [], next: null });
  });
  it('requires a decision', () => {
    expect(states({ ...intake, decision: 'PENDING' })).toEqual(['done', 'done', 'done', 'current', 'locked', 'locked']);
  });
  it.each(['FILE_SUIT', 'DO_NOT_FILE', 'CONSULTATION_ONLY', 'COMPLAIN_TO_AUTHORITY'])('needs no separate action for %s', (decision) => {
    expect(states({ ...intake, decision })[4]).toBe('done');
  });
  it('requires noticeIssuedAt for SEND_NOTICE', () => {
    expect(states({ ...intake, decision: 'SEND_NOTICE' })[4]).toBe('current');
    expect(states({ ...intake, decision: 'SEND_NOTICE', noticeIssuedAt: new Date() })[4]).toBe('done');
  });
  it('requires negotiation to have started for NEGOTIATE_FIRST', () => {
    expect(states({ ...intake, decision: 'NEGOTIATE_FIRST' })[4]).toBe('current');
  });
  it.each(['NOTICE_TO_SEND', 'NOTICE_SENT', 'UNDER_REVIEW', 'REPORT_PREPARED', 'OFFER_RECEIVED', 'NEGOTIATING', 'APPEAL_REVIEW', 'READY_TO_FILE', 'CLOSED_SETTLED', 'CLOSED_NO_FILE'])('accepts started pre-litigation status %s', (preLitigationStatus) => {
    expect(states({ ...intake, decision: 'NEGOTIATE_FIRST', preLitigationStatus })[4]).toBe('done');
  });
  it.each(['NO_RESPONSE', 'RECEIVED', 'ASSESSING', 'ACCEPTED'])('requires terminal status, %s is not closed', (status) => {
    expect(states({ ...intake, status })[5]).toBe('current');
  });
  it.each(['CONVERTED', 'REJECTED', 'CONSULTED'])('closes when %s', (status) => expect(states({ ...intake, status })[5]).toBe('done'));
});
