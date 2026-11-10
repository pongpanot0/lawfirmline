import { BadRequestException } from '@nestjs/common';
import { CaseStage, CASE_STAGE_LABELS_TH, partySide } from '@lawfirm/shared';
import type { Journey, JourneyStep } from '../intake/intake-journey';
import { stepMatchesSide, stepTaskTitle } from '../practice-setup/stage-scope';

type JourneyTask = {
  id: string;
  title: string;
  status: string;
  parentId: string | null;
  labels: string[];
  assignee: { firstName: string; lastName: string } | null;
  dueDate: Date | null;
  skippedReason: string | null;
};
type AppliedJourneyPlaybook = { taskIds: string[]; release: { steps: unknown } };

export const MAIN_JOURNEY_STAGES: CaseStage[] = [
  CaseStage.PRE_LITIGATION, CaseStage.FILING, CaseStage.ANSWER, CaseStage.MEDIATION,
  CaseStage.HEARING, CaseStage.AWAITING_JUDGMENT, CaseStage.ENFORCEMENT, CaseStage.CLOSING,
];

export function journeyStage(stage: string): CaseStage {
  return (['INTAKE_REVIEW', 'FACT_GATHERING'].includes(stage) ? CaseStage.PRE_LITIGATION : stage) as CaseStage;
}

export function nextJourneyStage(stage: string, toStage?: CaseStage): CaseStage | null {
  if (toStage) {
    if (toStage === CaseStage.CLOSING && stage !== CaseStage.CLOSING) return toStage;
    if (toStage === CaseStage.APPEAL && stage === CaseStage.AWAITING_JUDGMENT) return toStage;
    if (toStage === CaseStage.SUPREME && stage === CaseStage.APPEAL) return toStage;
    return null;
  }
  if (stage === CaseStage.APPEAL || stage === CaseStage.SUPREME) return CaseStage.ENFORCEMENT;
  return MAIN_JOURNEY_STAGES[MAIN_JOURNEY_STAGES.indexOf(journeyStage(stage)) + 1] ?? null;
}

export function assertJourneyAdvance(fromStage: string, toStage: CaseStage | null, journey: Journey): asserts toStage is CaseStage {
  if (!journey.canAdvance) {
    throw new BadRequestException({ message: 'ยังมีงานที่ต้องจัดการก่อนเปลี่ยนขั้นตอน', blockers: journey.blockers });
  }
  if (!toStage || (toStage !== nextJourneyStage(fromStage) && toStage !== nextJourneyStage(fromStage, toStage))) {
    throw new BadRequestException({ message: 'ไม่สามารถไปขั้นตอนที่ระบุได้', blockers: ['ไม่มีขั้นตอนถัดไป หรือขั้นตอนปลายทางไม่ถูกต้อง'] });
  }
}

export function preLitChecklist(
  info: { title?: string | null; clientId?: string | null; clientName?: string | null },
  conflict: { result: string } | null,
  requests: { required: boolean; status: string }[],
): Journey {
  const required = requests.filter((r) => r.required);
  const resolved = required.filter((r) => !['REQUESTED', 'MISSING'].includes(r.status)).length;
  const missing = [!info.title?.trim() ? 'ชื่อเรื่อง' : '', !info.clientId && !info.clientName?.trim() ? 'ข้อมูลลูกความ' : ''].filter(Boolean);
  const complete = [missing.length === 0, !!conflict && conflict.result !== 'NEEDS_REVIEW', resolved === required.length];
  const keys = ['INFO', 'CONFLICT', 'DOCUMENTS'];
  const labels = ['ข้อมูลเรื่องและลูกความครบ', 'ตรวจผลประโยชน์ขัดกัน', 'เอกสารจากลูกความ'];
  const texts = [
    `กรอก${missing.join('และ')}ให้ครบ`,
    conflict ? 'ทบทวนและบันทึกผลตรวจผลประโยชน์ขัดกัน' : 'ตรวจและบันทึกผลประโยชน์ขัดกัน',
    `เอกสารที่จำเป็นพร้อมแล้ว ${resolved} จาก ${required.length} รายการ — กด 'ได้รับแล้ว' หรือ 'ไม่ใช้' ให้ครบ`,
  ];
  const first = complete.indexOf(false);
  return {
    steps: keys.map((key, i) => ({ key, label: labels[i], state: complete[i] ? 'done' : 'current', summary: complete[i] ? labels[i] : texts[i] })),
    next: first < 0 ? null : { text: texts[first], done: first === 2 ? resolved : 0, total: first === 2 ? required.length : 1 },
    canAdvance: first < 0,
    blockers: texts.filter((_, i) => !complete[i]),
  };
}

export function caseJourney(
  legalCase: { stage: string; partyRole: string | null; openedAtStage?: string | null },
  tasks: JourneyTask[],
  applied: AppliedJourneyPlaybook[],
  preLit?: Journey,
): Journey & { preLitSteps: JourneyStep[]; preLitNext: Journey['next']; currentTasks: { id: string; title: string; status: string; assigneeName: string | null; dueDate: string | null; skippedReason: string | null }[] } {
  const stage = journeyStage(legalCase.stage);
  const stages = [...MAIN_JOURNEY_STAGES];
  if (stage === CaseStage.APPEAL || stage === CaseStage.SUPREME) stages.splice(6, 0, stage);
  const current = stages.indexOf(stage);
  const opened = stages.indexOf(journeyStage(legalCase.openedAtStage ?? CaseStage.PRE_LITIGATION));
  const side = partySide(legalCase.partyRole);
  const linked = new Set<string>();
  for (const application of applied) {
    if (!Array.isArray(application.release.steps)) continue;
    const titles = new Set<string>();
    for (const step of application.release.steps) {
      if (!step || typeof step.title !== 'string') continue;
      // shortcut: legacy tasks lack step IDs, so renamed legacy tasks need stage labels to retain their link.
      if ((!step.stage ? stage === CaseStage.PRE_LITIGATION : journeyStage(step.stage) === stage) && stepMatchesSide(step, side)) {
        titles.add(step.title.trim());
        titles.add(stepTaskTitle(step, side));
      }
    }
    for (const task of tasks) {
      if (application.taskIds.includes(task.id) && titles.has(task.title.trim())) linked.add(task.id);
    }
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const belongsToStage = (task: JourneyTask): boolean => {
    const visited = new Set<string>();
    let ancestor: JourneyTask | undefined = task;
    while (ancestor && !visited.has(ancestor.id)) {
      visited.add(ancestor.id);
      const stageLabels = ancestor.labels.filter((label) => label.startsWith('stage:'));
      if (stageLabels.length) return stageLabels.some((label) => journeyStage(label.slice(6)) === stage);
      if (linked.has(ancestor.id)) return true;
      ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
    }
    return false;
  };
  const currentTasks = tasks.filter(belongsToStage).map((task) => ({
    id: task.id, title: task.title, status: task.status,
    assigneeName: task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}`.trim() : null,
    dueDate: task.dueDate?.toISOString() ?? null,
    skippedReason: task.skippedReason,
  }));
  const pending = currentTasks.filter((task) => task.status !== 'DONE' && !task.skippedReason);
  const done = currentTasks.length - pending.length;
  const nextStage = nextJourneyStage(stage);
  return {
    steps: stages.map((key, i) => ({
      key, label: CASE_STAGE_LABELS_TH[key], state: i < current ? 'done' : i === current ? 'current' : 'locked',
      summary: i < opened ? 'ข้ามตอนเปิดคดี' : i < current ? 'ผ่านขั้นตอนนี้แล้ว' : null,
      ...(i < opened ? { skippedAtOpen: true } : {}),
      unlockHint: i > current ? `ปลดล็อกเมื่อเสร็จขั้น${CASE_STAGE_LABELS_TH[stages[i - 1]]}` : null,
    })),
    next: pending.length ? { text: `จัดการงานขั้น${CASE_STAGE_LABELS_TH[stage]}แล้ว ${done} จาก ${currentTasks.length} รายการ — ทำให้เสร็จหรือข้ามพร้อมเหตุผลอีก ${pending.length} รายการ`, done, total: currentTasks.length }
      : nextStage ? { text: `งานขั้น${CASE_STAGE_LABELS_TH[stage]}ครบแล้ว — ไปขั้น${CASE_STAGE_LABELS_TH[nextStage]}`, done, total: currentTasks.length } : null,
    preLitSteps: preLit?.steps ?? [],
    preLitNext: preLit?.next ?? null,
    canAdvance: pending.length === 0 && (preLit?.canAdvance ?? true),
    blockers: [...(preLit?.blockers ?? []), ...pending.map((task) => `งานยังไม่เสร็จหรือข้าม: ${task.title}`)],
    currentTasks,
  };
}
