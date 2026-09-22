type CaseParticipant = { name: string; role: string };

const PARTY_ROLES = {
  plaintiff: new Set(['PLAINTIFF', 'JOINT_PLAINTIFF']),
  defendant: new Set(['DEFENDANT', 'JOINT_DEFENDANT']),
};

export function casePartyDisplay(participants: CaseParticipant[], party: keyof typeof PARTY_ROLES) {
  return participants
    .filter((participant) => PARTY_ROLES[party].has(participant.role))
    .map((participant) => participant.name.trim())
    .filter(Boolean)
    .join(', ') || '—';
}
