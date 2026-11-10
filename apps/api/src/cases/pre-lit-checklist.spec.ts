import { preLitChecklist } from './case-journey';

describe('preLitChecklist', () => {
  it('has three independent items, with missing info and required documents as blockers', () => {
    const result = preLitChecklist({ title: ' ', clientId: null, clientName: null }, { result: 'NEEDS_REVIEW' }, [{ required: true, status: 'MISSING' }]);
    expect(result.steps.map((s) => [s.key, s.state])).toEqual([['INFO', 'current'], ['CONFLICT', 'current'], ['DOCUMENTS', 'current']]);
    expect(result.next?.text).toBe('กรอกชื่อเรื่องและข้อมูลลูกความให้ครบ');
    expect(result.blockers).toHaveLength(3);
    expect(result.canAdvance).toBe(false);
  });
  it('counts only required requests and accepts waived documents', () => {
    const info = { title: 'คดี', clientId: 'client', clientName: null };
    const result = preLitChecklist(info, { result: 'CLEAR' }, [
      { required: true, status: 'RECEIVED' }, { required: true, status: 'NOT_REQUIRED' },
      { required: true, status: 'REQUESTED' }, { required: false, status: 'MISSING' },
    ]);
    expect(result.next).toMatchObject({ done: 2, total: 3 });
    expect(result.steps.slice(0, 2).every((s) => s.state === 'done')).toBe(true);
    expect(preLitChecklist(info, { result: 'OVERRIDDEN' }, [{ required: false, status: 'REQUESTED' }])).toMatchObject({ canAdvance: true, blockers: [], next: null });
  });
  it('requires a conflict record even when info and documents are complete', () => {
    const result = preLitChecklist({ title: 'คดี', clientName: 'ลูกความ' }, null, []);
    expect(result.steps.map((s) => s.state)).toEqual(['done', 'current', 'done']);
    expect(result.blockers).toHaveLength(1);
  });
});
