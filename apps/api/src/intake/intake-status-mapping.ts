export interface IntakeLike {
  status: 'RECEIVED' | 'ASSESSING' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
  decision:
    | 'FILE_SUIT'
    | 'DO_NOT_FILE'
    | 'NEGOTIATE_FIRST'
    | 'SEND_NOTICE'
    | 'COMPLAIN_TO_AUTHORITY'
    | 'PENDING'
    | null;
}

const STATUS_LABELS: Record<IntakeLike['status'], string> = {
  RECEIVED: 'สำนักงานรับเรื่องแล้ว',
  ASSESSING: 'รอตกลงขอบเขต',
  ACCEPTED: 'รับดำเนินการ',
  REJECTED: 'ไม่รับดำเนินการ',
  CONVERTED: 'รับดำเนินการ',
};

export function mapInternalStatusToExternal(intake: IntakeLike): string {
  return STATUS_LABELS[intake.status];
}
