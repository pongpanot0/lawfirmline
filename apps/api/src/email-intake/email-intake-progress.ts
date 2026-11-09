const pending = new Set(['SUGGESTED', 'REQUIRES_CONFIRMATION', 'CONFLICT']);

export function intakeProgress(
  thread: { intake: { status: string } | null; case?: unknown },
  proposals: { field: string; status: string; sourceDocumentId?: string | null }[],
  hasFiles: boolean,
  aiRead: boolean,
) {
  const fields = proposals.filter((p) => p.field !== 'document');
  // A file the lawyer deleted leaves its proposal without a source; it can't be resolved, so it can't block.
  const documents = proposals.filter((p) => p.field === 'document' && p.sourceDocumentId !== null);
  const unresolvedFields = fields.filter((p) => pending.has(p.status)).length;
  const unresolvedDocuments = documents.filter((p) => pending.has(p.status)).length;
  const completed = [
    !!thread.intake || !!thread.case,
    aiRead || proposals.length > 0,
    unresolvedFields === 0,
    !hasFiles || unresolvedDocuments === 0,
    !!thread.case || !!thread.intake && ['ASSESSING', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'CONSULTED'].includes(thread.intake.status),
  ];
  const keys = ['ACCEPT', 'AI_READ', 'CONFIRM', 'DOCUMENTS', 'SUBMIT'] as const;
  const labels = ['รับเป็นเรื่อง', 'AI อ่านอีเมลและไฟล์', 'ตรวจและยืนยันข้อมูล', 'จัดเอกสาร', 'ส่งประเมิน / เปิดคดี'];
  const current = completed.indexOf(false);
  const steps = keys.map((key, i) => ({ key, label: labels[i], state: (current < 0 || i < current ? 'done' : i === current ? 'current' : 'locked') as 'done' | 'current' | 'locked' }));
  const next = current < 0 ? null : current === 2
    ? { text: `ยืนยันข้อมูลอีก ${unresolvedFields} รายการ แล้วไปขั้นจัดเอกสาร`, done: fields.length - unresolvedFields, total: fields.length }
    : current === 3
      ? { text: `จัดเอกสารอีก ${unresolvedDocuments} รายการ แล้วส่งประเมิน / เปิดคดี`, done: documents.length - unresolvedDocuments, total: documents.length }
      : { text: ['รับอีเมลเป็นเรื่องเพื่อเริ่มตรวจข้อมูล', 'ให้ AI อ่านอีเมลและไฟล์แนบ', '', '', 'ส่งเรื่องประเมิน / เปิดคดี'][current], done: 0, total: 1 };
  return { steps, next };
}
