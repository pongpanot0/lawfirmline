import { CASE_STAGE_ORDER, CaseStage } from './index';
import { MONEY_MAX } from './validation';

export type FeeComponent =
  | { type: 'FIXED'; label?: string; amount: number }
  | { type: 'PERCENT_CLAIM'; rate: number; min?: number; max?: number }
  | { type: 'TIERED_CLAIM'; brackets: { upTo: number | null; rate: number }[] }
  | { type: 'PERCENT_RECOVERY'; rate: number; min?: number }
  | { type: 'PER_UNIT'; amount: number; unitKey: string; unitLabel: string }
  | { type: 'HOURLY' };
export interface FeeMilestone { id: string; label: string; stage: CaseStage; percent: number }
export interface FeeInputs { claimAmount?: number; recoveryAmount?: number; units?: Record<string, number> }
export type FeeRequiredInput = 'claimAmount' | 'recoveryAmount' | `unit:${string}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MONEY_MAX;
const rate = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 500;

/** Accept unknown here: package JSON is an API trust boundary too. */
export function validateFeePackage(value: unknown): string[] {
  const errors: string[] = [];
  const data = value as { components?: FeeComponent[]; milestones?: FeeMilestone[] } | null;
  if (!data || !Array.isArray(data.components) || !data.components.length) errors.push('เพิ่มส่วนประกอบค่าธรรมเนียมอย่างน้อยหนึ่งรายการ');
  else for (const c of data.components) {
    if (!c || typeof c !== 'object') { errors.push('ส่วนประกอบค่าธรรมเนียมไม่ถูกต้อง'); continue; }
    switch (c.type) {
      case 'FIXED':
      case 'PER_UNIT':
        if (!money(c.amount)) errors.push('จำนวนเงินต้องอยู่ระหว่าง 0 ถึง 100,000,000 บาท');
        if (c.type === 'PER_UNIT' && (!text(c.unitKey) || !text(c.unitLabel) || ['__proto__', 'constructor', 'prototype'].includes(c.unitKey))) errors.push('ระบุชื่อและรหัสหน่วยให้ถูกต้อง');
        if (c.type === 'FIXED' && c.label !== undefined && !text(c.label)) errors.push('ระบุชื่อค่าธรรมเนียมให้ถูกต้อง');
        break;
      case 'PERCENT_CLAIM':
      case 'PERCENT_RECOVERY':
        if (!rate(c.rate)) errors.push('อัตราร้อยละต้องอยู่ระหว่าง 0 ถึง 100');
        if (c.min !== undefined && !money(c.min)) errors.push('ค่าธรรมเนียมขั้นต่ำไม่ถูกต้อง');
        if (c.type === 'PERCENT_CLAIM' && c.max !== undefined && (!money(c.max) || c.max < (c.min ?? 0))) errors.push('ค่าธรรมเนียมสูงสุดต้องไม่น้อยกว่าขั้นต่ำ');
        break;
      case 'TIERED_CLAIM': {
        let previous = 0;
        if (!Array.isArray(c.brackets) || !c.brackets.length) errors.push('ระบุช่วงทุนทรัพย์');
        else c.brackets.forEach((b, i) => {
          if (!b || !rate(b.rate) || (i === c.brackets.length - 1 ? b.upTo !== null : !money(b.upTo) || b.upTo <= previous)) errors.push('ช่วงทุนทรัพย์ต้องเรียงจากน้อยไปมากและช่วงสุดท้ายไม่จำกัด');
          if (b && b.upTo !== null) previous = b.upTo;
        });
        break;
      }
      case 'HOURLY': break;
      default: errors.push('ประเภทค่าธรรมเนียมไม่ถูกต้อง');
    }
  }
  if (!data || !Array.isArray(data.milestones) || data.milestones.length > 12) errors.push('ระบุงวดค่าธรรมเนียมได้ไม่เกิน 12 งวด');
  else {
    const ids = new Set<string>();
    for (const m of data.milestones) {
      if (!m || !text(m.id) || ids.has(m.id) || !text(m.label) || !CASE_STAGE_ORDER.includes(m.stage) || !rate(m.percent)) errors.push('ข้อมูลงวดหรือขั้นตอนคดีไม่ถูกต้อง');
      if (m) ids.add(m.id);
    }
    if (data.milestones.length && Math.abs(data.milestones.reduce((sum, m) => sum + (m?.percent ?? 0), 0) - 100) > 0.000001) errors.push('สัดส่วนงวดต้องรวมเป็น 100%');
  }
  return errors;
}

export function computeFeePackage(components: FeeComponent[], inputs: FeeInputs) {
  const errors = validateFeePackage({ components, milestones: [] });
  if (errors.length) throw new Error(errors.join(', '));
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) throw new Error('ข้อมูลคำนวณไม่ถูกต้อง');
  if ((inputs.claimAmount !== undefined && !money(inputs.claimAmount)) || (inputs.recoveryAmount !== undefined && !money(inputs.recoveryAmount)) ||
    (inputs.units !== undefined && (!inputs.units || typeof inputs.units !== 'object' || Array.isArray(inputs.units) || Object.values(inputs.units).some(n => !money(n))))) throw new Error('ข้อมูลคำนวณต้องเป็นจำนวนตั้งแต่ 0 ถึง 100,000,000');
  const requiredInputs: FeeRequiredInput[] = [];
  const input = (key: FeeRequiredInput): number => {
    if (!requiredInputs.includes(key)) requiredInputs.push(key);
    const value = key.startsWith('unit:') ? inputs.units?.[key.slice(5)] : inputs[key as 'claimAmount' | 'recoveryAmount'];
    if (value !== undefined && !money(value)) throw new Error('ข้อมูลคำนวณต้องเป็นจำนวนตั้งแต่ 0 ถึง 100,000,000');
    return value ?? 0;
  };
  const parts = components.map(c => {
    let label: string;
    let amount: number;
    switch (c.type) {
      case 'FIXED': label = c.label ?? 'ค่าธรรมเนียมคงที่'; amount = c.amount; break;
      case 'PERCENT_CLAIM': label = 'ค่าธรรมเนียมตามทุนทรัพย์'; amount = Math.min(c.max ?? MONEY_MAX, Math.max(c.min ?? 0, input('claimAmount') * c.rate / 100)); break;
      case 'PERCENT_RECOVERY': label = 'ค่าธรรมเนียมตามยอดที่ได้รับ'; amount = Math.max(c.min ?? 0, input('recoveryAmount') * c.rate / 100); break;
      case 'PER_UNIT': label = c.unitLabel; amount = c.amount * input(`unit:${c.unitKey}`); break;
      case 'HOURLY': label = 'ค่าธรรมเนียมรายชั่วโมง'; amount = 0; break;
      case 'TIERED_CLAIM': {
        label = 'ค่าธรรมเนียมตามช่วงทุนทรัพย์';
        const claim = input('claimAmount');
        let previous = 0;
        amount = 0;
        for (const b of c.brackets) {
          amount += Math.max(0, Math.min(claim, b.upTo ?? claim) - previous) * b.rate / 100;
          previous = b.upTo ?? claim;
        }
        break;
      }
    }
    if (!money(amount)) throw new Error('ค่าธรรมเนียมเกินวงเงินที่กำหนด');
    return { label, amount: round2(amount) };
  });
  const total = round2(parts.reduce((sum, p) => sum + p.amount, 0));
  if (!money(total)) throw new Error('ค่าธรรมเนียมรวมเกินวงเงินที่กำหนด');
  return { total, parts, requiredInputs };
}

export function splitMilestones(total: number, milestones: FeeMilestone[]): number[] {
  if (!money(total)) throw new Error('จำนวนเงินไม่ถูกต้อง');
  // Work in satang so even tiny totals never produce a negative last instalment.
  let remaining = Math.round(total * 100);
  return milestones.map((m, i) => {
    const cents = i === milestones.length - 1 ? remaining : Math.min(remaining, Math.round(total * m.percent));
    remaining -= cents;
    return cents / 100;
  });
}
