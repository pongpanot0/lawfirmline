import { intakeJourney } from './intake-journey';

const intake: Parameters<typeof intakeJourney>[0] = { title: 'เรื่อง', clientId: 'client', clientName: null, decision: 'FILE_SUIT', status: 'CONVERTED', hasCase: true };
const clear = { result: 'CLEAR' };
const states = (input = intake, conflict: { result: string } | null = clear, requests: { required: boolean; status: string }[] = []) => intakeJourney(input, conflict, requests).steps.map((s) => s.state);

describe('intakeJourney', () => {
  it('ends at the pre-litigation case: four steps, all done once the case exists', () => {
    const result = intakeJourney(intake, clear, []);
    expect(result.steps.map((s) => s.key)).toEqual(['INFO', 'CONFLICT', 'DOCUMENTS', 'DECISION']);
    expect(result.steps.every((s) => s.state === 'done' && s.summary)).toBe(true);
    expect(result).toMatchObject({ canAdvance: true, blockers: [], next: null });
  });
  it.each([
    { title: null }, { title: '  ' }, { clientId: null, clientName: null }, { clientId: null, clientName: '  ' },
  ])('requires title and client information: %j', (patch) => {
    expect(states({ ...intake, ...patch })).toEqual(['current', 'locked', 'locked', 'locked']);
  });
  it('accepts clientName without clientId', () => {
    expect(states({ ...intake, clientId: null, clientName: 'ลูกความ' })[0]).toBe('done');
  });
  it.each([null, { result: 'NEEDS_REVIEW' }])('requires a resolved latest conflict result %j', (conflict) => {
    const result = intakeJourney(intake, conflict, []);
    expect(result.steps.map((s) => s.state)).toEqual(['done', 'current', 'locked', 'locked']);
    expect(result.steps[2].unlockHint).toContain('ปลดล็อก');
    expect(result.canAdvance).toBe(false);
    expect(result.blockers).toEqual([result.next!.text]);
  });
  it.each(['CLEAR', 'POTENTIAL_CONFLICT', 'CONFLICT'])('accepts non-review conflict result %s', (result) => {
    expect(states(intake, { result })[1]).toBe('done');
  });
  it.each(['REQUESTED', 'MISSING'])('blocks required %s documents and reports exact progress', (status) => {
    const result = intakeJourney(intake, clear, [{ required: true, status }, { required: true, status: 'RECEIVED' }, { required: true, status: 'NOT_APPLICABLE' }, { required: false, status: 'MISSING' }]);
    expect(result.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'locked']);
    expect(result.next).toMatchObject({ done: 2, total: 3 });
    expect(result.next!.text).toContain('2 จาก 3');
  });
  it('waits for the decision even when the case already exists', () => {
    expect(states({ ...intake, decision: 'PENDING', status: 'CONVERTED', hasCase: true })).toEqual(['done', 'done', 'done', 'current']);
    expect(states({ ...intake, decision: 'FILE_SUIT', status: 'ACCEPTED', hasCase: false })).toEqual(['done', 'done', 'done', 'done']);
  });
  it.each(['REJECTED', 'CONSULTED'])('a %s matter is closed without a case', (status) => {
    const result = intakeJourney({ ...intake, decision: 'DO_NOT_FILE', status, hasCase: false }, clear, []);
    expect(result.steps.every((s) => s.state === 'done')).toBe(true);
  });
});
