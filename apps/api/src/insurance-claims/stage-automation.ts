import { InsuranceClaimStage, INSURANCE_CLAIM_STAGE_ORDER } from '@lawfirm/shared';

export function getAllowedNextStages(current: InsuranceClaimStage): InsuranceClaimStage[] {
  const currentIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(current);
  return INSURANCE_CLAIM_STAGE_ORDER.slice(currentIndex + 1);
}

export function isValidTransition(
  current: InsuranceClaimStage,
  target: InsuranceClaimStage,
): boolean {
  return getAllowedNextStages(current).includes(target);
}

export interface StageTaskTemplate {
  title: string;
  dueInDays: number;
}

export const STAGE_TASK_TEMPLATES: Partial<Record<InsuranceClaimStage, StageTaskTemplate[]>> = {
  [InsuranceClaimStage.DEMAND_SENT]: [
    { title: 'ส่งหนังสือทวงถามพร้อมสงวนสิทธิ์เรียกร้องค่าเสียหาย', dueInDays: 7 },
  ],
  [InsuranceClaimStage.OIC_COMPLAINT]: [
    { title: 'ยื่นเรื่องร้องเรียนต่อ คปภ. (e-Complaint)', dueInDays: 7 },
  ],
  [InsuranceClaimStage.SUIT_FILED]: [
    { title: 'เตรียมคำฟ้องและยื่นฟ้องต่อศาลที่มีเขตอำนาจ', dueInDays: 14 },
  ],
};
