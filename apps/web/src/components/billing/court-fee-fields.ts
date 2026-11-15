import type { CourtFeeCaseKind } from '@lawfirm/shared';

export function courtFeeNeedsClaim(kind: CourtFeeCaseKind): boolean {
  return !(['NON_MONETARY', 'CONSUMER', 'LABOUR', 'BANKRUPTCY'] as CourtFeeCaseKind[]).includes(kind);
}
