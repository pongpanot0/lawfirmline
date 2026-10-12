import { PARTICIPANT_ROLE_LABELS, groupParticipantsBySide } from '@lawfirm/shared';

describe('groupParticipantsBySide', () => {
  it('orders our side, then the opponents, then neutral, dropping empty groups', () => {
    const groups = groupParticipantsBySide([
      { id: 'w', side: 'NEUTRAL' },
      { id: 'o1', side: 'OPPONENT' },
      { id: 'u', side: 'OURS' },
      { id: 'o2', side: 'OPPONENT' },
    ]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['ฝ่ายเรา', ['u']],
      ['ฝ่ายตรงข้าม', ['o1', 'o2']],
      ['ผู้เกี่ยวข้อง', ['w']],
    ]);
    expect(groupParticipantsBySide([{ id: 'x', side: 'OURS' }]).map((g) => g.side)).toEqual(['OURS']);
  });

  it('labels every participant role in Thai', () => {
    expect(PARTICIPANT_ROLE_LABELS.RESPONDENT).toBe('ผู้คัดค้าน');
    expect(PARTICIPANT_ROLE_LABELS.OPPOSING_LAWYER).toBe('ทนายฝ่ายตรงข้าม');
  });
});
