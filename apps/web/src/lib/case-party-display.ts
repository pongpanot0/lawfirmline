import { TMP_CLIENT_PLACEHOLDER } from '@lawfirm/shared';

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

/** A case's client as people should read it: the "tmp" placeholder (no client chosen yet) reads as none. */
export function caseClientName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed && trimmed !== TMP_CLIENT_PLACEHOLDER ? trimmed : null;
}
