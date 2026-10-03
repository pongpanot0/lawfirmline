/** Office-authored instructions are snapshotted on the existing task at creation. */
export interface TaskRoutineDefinition {
  expectedOutput: string;
  checks: string[];
  attachment: 'NONE' | 'ANY' | 'PDF';
  sourceHint?: string;
  exampleFilename?: string;
  sourceTemplate?: string;
  exampleOutput?: string;
  missingDocuments?: string;
}

export interface TaskRoutineSnapshot extends TaskRoutineDefinition {
  releaseId: string;
  releaseName: string;
  version: number;
  stepIndex: number;
}

export function taskRoutineSnapshot(release: { id: string; name: string; version: number }, stepIndex: number, definition: TaskRoutineDefinition): TaskRoutineSnapshot {
  if (!definition.expectedOutput?.trim() || !Array.isArray(definition.checks) || !definition.checks.length || definition.checks.length > 30 ||
    definition.checks.some(check => typeof check !== 'string' || !check.trim()) || !['NONE', 'ANY', 'PDF'].includes(definition.attachment)) {
    throw new Error('วิธีทำงานประจำไม่ครบ กรุณาให้ผู้ดูแลแก้ SOP ก่อน');
  }
  for (const [field, limit] of [['sourceHint', 1000], ['exampleFilename', 300], ['sourceTemplate', 4000], ['exampleOutput', 6000], ['missingDocuments', 2000]] as const) {
    const text = definition[field];
    if (text !== undefined && (typeof text !== 'string' || text.length > limit)) throw new Error('ข้อความต้นแบบงานประจำไม่ถูกต้องหรือยาวเกินไป');
  }
  return { ...definition, checks: definition.checks.map(check => check.trim()), expectedOutput: definition.expectedOutput.trim(),
    releaseId: release.id, releaseName: release.name, version: release.version, stepIndex };
}

export function dailyUpdateParts(body: string) {
  const match = body.match(/^ทำถึงไหน: ([\s\S]*?)\nเหลืออะไร: ([\s\S]*?)\nติดอะไร: ([\s\S]*)$/);
  return { completed: match?.[1] ?? body, remaining: match?.[2] ?? '', blocker: match?.[3]?.trim() === 'ไม่มี' ? '' : match?.[3]?.trim() ?? '' };
}

/** Checklist attestations do not prove PDF quality; the assigned reviewer still inspects the result. */
export function routineMissing(routine: TaskRoutineSnapshot | null | undefined, completed: number[], attachments: { mimeType?: string }[], blocker = '') {
  if (!routine) return [];
  const missing = routine.checks.filter((_, index) => !completed.includes(index));
  if (routine.attachment !== 'NONE' && !attachments.some(file => routine.attachment === 'ANY' || file.mimeType === 'application/pdf')) {
    missing.unshift(routine.attachment === 'PDF' ? 'แนบไฟล์ PDF ที่ทำเสร็จกับงานนี้' : 'แนบผลงานกับงานนี้');
  }
  if (blocker.trim()) missing.unshift(`แก้จุดติดขัดและอัปเดตรายงาน: ${blocker.trim()}`);
  return missing;
}
