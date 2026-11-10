export type JourneyStep = {
  skippedAtOpen?: boolean;
  key: string;
  label: string;
  state: 'done' | 'current' | 'locked';
  summary?: string | null;
  unlockHint?: string | null;
};

export type Journey = {
  steps: JourneyStep[];
  next: { text: string; done: number; total: number } | null;
  canAdvance: boolean;
  blockers: string[];
};

type IntakeJourneyInput = {
  title: string | null;
  clientId: string | null;
  clientName: string | null;
  decision: string;
  status: string;
  /** The matter already became a (pre-litigation) case. */
  hasCase: boolean;
};

export function intakeJourney(
  intake: IntakeJourneyInput,
  conflict: { result: string } | null,
  requests: { required: boolean; status: string }[],
): Journey {
  const required = requests.filter((r) => r.required);
  const unresolved = required.filter((r) => ['REQUESTED', 'MISSING'].includes(r.status)).length;
  const resolved = required.length - unresolved;
  const missingInfo = [
    !intake.title?.trim() ? 'ชื่อเรื่อง' : '',
    !intake.clientId && !intake.clientName?.trim() ? 'ข้อมูลลูกความ' : '',
  ].filter(Boolean);
  const complete = [
    missingInfo.length === 0,
    !!conflict && conflict.result !== 'NEEDS_REVIEW',
    unresolved === 0,
    intake.decision !== 'PENDING',
  ];
  const keys = ['INFO', 'CONFLICT', 'DOCUMENTS', 'DECISION'];
  const labels = ['รับเรื่อง / ข้อมูลครบ', 'ตรวจผลประโยชน์ขัดกัน', 'ขอเอกสารจากลูกความ', 'ประเมินและตัดสินใจรับเรื่อง'];
  const texts = [
    `กรอก${missingInfo.join('และ')}ให้ครบ แล้วไปขั้นตรวจผลประโยชน์ขัดกัน`,
    conflict ? 'ทบทวนและบันทึกผลตรวจผลประโยชน์ขัดกัน แล้วไปขั้นขอเอกสาร' : 'ตรวจและบันทึกผลประโยชน์ขัดกัน แล้วไปขั้นขอเอกสาร',
    `เอกสารที่จำเป็นได้รับแล้วหรือระบุว่าไม่จำเป็น ${resolved} จาก ${required.length} รายการ — รับครบหรือกด 'ไม่จำเป็น' แล้วไปขั้นประเมิน`,
    'ประเมินและตัดสินใจรับดำเนินการ หรือไม่รับ',
  ];
  const summaries = ['ข้อมูลเรื่องและลูกความครบ', 'บันทึกผลตรวจแล้ว', `เอกสารที่จำเป็นครบ ${required.length} รายการ`, 'บันทึกการตัดสินใจแล้ว'];
  const current = complete.indexOf(false);
  return {
    steps: keys.map((key, i) => ({
      key, label: labels[i],
      state: current < 0 || i < current ? 'done' : i === current ? 'current' : 'locked',
      summary: current < 0 || i < current ? summaries[i] : null,
      unlockHint: current >= 0 && i > current ? `ปลดล็อกเมื่อเสร็จขั้น${labels[i - 1]}` : null,
    })),
    next: current < 0 ? null : { text: texts[current], done: current === 2 ? resolved : 0, total: current === 2 ? required.length : 1 },
    canAdvance: current < 0,
    blockers: current < 0 ? [] : [texts[current]],
  };
}
