export type JourneyStep = {
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
  // Accepting a matter opens it as a pre-litigation case right away (notice and negotiation are
  // case work at its "ก่อนฟ้อง" stage), so the intake journey ends at that decision.
  const closed = ['CONVERTED', 'REJECTED', 'CONSULTED'].includes(intake.status) || intake.hasCase;
  const complete = [
    missingInfo.length === 0,
    !!conflict && conflict.result !== 'NEEDS_REVIEW',
    unresolved === 0,
    intake.decision !== 'PENDING',
    closed,
  ];
  const keys = ['INFO', 'CONFLICT', 'DOCUMENTS', 'DECISION', 'CASE'];
  const labels = ['รับเรื่อง / ข้อมูลครบ', 'ตรวจผลประโยชน์ขัดกัน', 'ขอเอกสารจากลูกความ', 'ประเมินและตัดสินใจรับเรื่อง', 'เปิดเป็นคดีก่อนฟ้อง หรือปิดเรื่อง'];
  const texts = [
    `กรอก${missingInfo.join('และ')}ให้ครบ แล้วไปขั้นตรวจผลประโยชน์ขัดกัน`,
    conflict ? 'ทบทวนและบันทึกผลตรวจผลประโยชน์ขัดกัน แล้วไปขั้นขอเอกสาร' : 'ตรวจและบันทึกผลประโยชน์ขัดกัน แล้วไปขั้นขอเอกสาร',
    `เอกสารที่จำเป็นได้รับแล้วหรือระบุว่าไม่จำเป็น ${resolved} จาก ${required.length} รายการ — รับครบหรือกด 'ไม่จำเป็น' แล้วไปขั้นประเมิน`,
    'ประเมินและตัดสินใจ: รับดำเนินการ (เปิดเป็นคดีก่อนฟ้อง) หรือไม่รับ',
    'เปิดเป็นคดีก่อนฟ้อง หรือปิดเรื่องให้เสร็จ',
  ];
  const summaries = ['ข้อมูลเรื่องและลูกความครบ', 'บันทึกผลตรวจแล้ว', `เอกสารที่จำเป็นครบ ${required.length} รายการ`, 'บันทึกการตัดสินใจแล้ว',
    intake.hasCase || intake.status === 'CONVERTED' ? 'เปิดเป็นคดีก่อนฟ้องแล้ว' : 'ปิดเรื่องแล้ว'];
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
