import type { FeeComponent, FeeInputs, FeeMilestone } from '@lawfirm/shared';
import type { TaxClass } from './invoice-composer';
export type FeePackage = { id: string; name: string; components: FeeComponent[]; milestones: FeeMilestone[]; feeTaxClass: TaxClass };
export type CaseMilestone = { id: string; label: string; stage: FeeMilestone['stage']; percent: number; amount: number; sortOrder: number; status: 'PENDING' | 'PARTIAL' | 'INVOICED' | 'WAIVED'; invoiceId: string | null; reached: boolean; closeAmount: number | null; closeReason: string | null };
export type CaseFee = { packageId: string | null; packageSnapshot: Omit<FeePackage, 'id' | 'feeTaxClass'> & { version: number } | null; inputs: FeeInputs | null; standardAmount: number; agreedAmount: number; overrideReason: string | null; feeTaxClass: TaxClass; updatedAt: string; milestones: CaseMilestone[] };
export type DueMilestone = CaseMilestone & { case: { id: string; ownRef: string; title: string }; caseFee: { feeTaxClass: TaxClass } };
