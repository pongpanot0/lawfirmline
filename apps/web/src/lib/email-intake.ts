import type { EmailIntakeStep, IntakeFieldProposalItem } from './api';

export const isPending = (p: IntakeFieldProposalItem) => ['SUGGESTED', 'REQUIRES_CONFIRMATION', 'CONFLICT'].includes(p.status);
export const moneyFields = ['estimatedDamage', 'insurerPaidAmount', 'settlementOfferAmount', 'otherAmount'];

export function groupProposals(proposals: IntakeFieldProposalItem[]) {
  const groups = new Map<string | null, IntakeFieldProposalItem[]>();
  for (const proposal of proposals) {
    const key = proposal.matterLabel || null;
    groups.set(key, [...(groups.get(key) ?? []), proposal]);
  }
  return [...groups.entries()];
}

export function parseOtherAmount(value: string | null): { label: string; amount: number } | null {
  try {
    const parsed = JSON.parse(value ?? '');
    return typeof parsed?.label === 'string' && typeof parsed?.amount === 'number' && Number.isFinite(parsed.amount) ? parsed : null;
  } catch { return null; }
}

export function parseDocument(value: string | null): { documentId: string; filename: string; docTypeLabel: string; docRequestId: string | null } | null {
  try {
    const parsed = JSON.parse(value ?? '');
    return typeof parsed?.documentId === 'string' && typeof parsed?.filename === 'string' && typeof parsed?.docTypeLabel === 'string' && (parsed.docRequestId == null || typeof parsed.docRequestId === 'string') ? parsed : null;
  } catch { return null; }
}

export function submitHelper(steps: EmailIntakeStep[]) {
  const missing = steps.filter((step) => (step.key === 'CONFIRM' || step.key === 'DOCUMENTS') && step.state !== 'done').map((step) => step.label);
  return missing.length ? 'ต้องทำให้ครบก่อน: ' + missing.join(' และ ') : 'พร้อมส่งประเมิน';
}
