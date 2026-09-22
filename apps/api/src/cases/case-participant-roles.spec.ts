import { ParticipantRole } from '@lawfirm/shared';

describe('Case participant roles', () => {
  it('supports multiple parties including joint plaintiffs and defendants', () => {
    expect(ParticipantRole.PLAINTIFF).toBe('PLAINTIFF');
    expect(ParticipantRole.DEFENDANT).toBe('DEFENDANT');
    expect(ParticipantRole.JOINT_PLAINTIFF).toBe('JOINT_PLAINTIFF');
    expect(ParticipantRole.JOINT_DEFENDANT).toBe('JOINT_DEFENDANT');
    expect(ParticipantRole.PETITIONER).toBe('PETITIONER');
    expect(ParticipantRole.RESPONDENT).toBe('RESPONDENT');
  });
});
