import { resolveAssignee } from './practice-setup.service';

describe('resolveAssignee', () => {
  const ownerId = 'owner-1';

  it('มอบให้คนใน role หลักที่อยู่ในทีมคดีก่อน', () => {
    const result = resolveAssignee({
      primaryRole: 'SENIOR_LAWYER',
      firmMembers: [
        { userId: 'senior-off-team', role: 'SENIOR_LAWYER' },
        { userId: 'senior-on-team', role: 'SENIOR_LAWYER' },
      ],
      teamIds: new Set([ownerId, 'senior-on-team']),
      ownerId,
    });
    expect(result).toBe('senior-on-team');
  });

  it('ไม่มีใครใน role หลักในทีม แต่มีในสำนักงาน ก็มอบให้คนแรกที่เจอ', () => {
    const result = resolveAssignee({
      primaryRole: 'SENIOR_LAWYER',
      firmMembers: [{ userId: 'senior-anywhere', role: 'SENIOR_LAWYER' }],
      teamIds: new Set([ownerId]),
      ownerId,
    });
    expect(result).toBe('senior-anywhere');
  });

  it('ไม่มีใครใน role หลักเลย ตกไปที่ role สำรอง', () => {
    const result = resolveAssignee({
      primaryRole: 'SENIOR_LAWYER',
      secondaryRole: 'LAWYER',
      firmMembers: [{ userId: 'lawyer-1', role: 'LAWYER' }],
      teamIds: new Set([ownerId]),
      ownerId,
    });
    expect(result).toBe('lawyer-1');
  });

  it('ไม่มีใครใน role หลักหรือสำรองเลย ตกไปที่เจ้าของคดี', () => {
    const result = resolveAssignee({
      primaryRole: 'ASSISTANT',
      secondaryRole: 'SENIOR_LAWYER',
      firmMembers: [{ userId: 'lawyer-1', role: 'LAWYER' }],
      teamIds: new Set([ownerId]),
      ownerId,
    });
    expect(result).toBe(ownerId);
  });

  it('ไม่ระบุ role เลย มอบให้เจ้าของคดีตรงๆ', () => {
    const result = resolveAssignee({ firmMembers: [], teamIds: new Set([ownerId]), ownerId });
    expect(result).toBe(ownerId);
  });
});
