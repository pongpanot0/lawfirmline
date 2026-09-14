import type { CalendarEventItem } from './api';
export interface CourtDayState {
  checklist: { id: string; title: string; done: boolean }[];
  taskIds: string[];
  documents: { id: string; version: number }[];
  notes: string;
  outcome: string;
  nextHearing: boolean;
  nextTitle: string;
  nextAt: string;
  followUp: boolean;
  taskTitle: string;
  taskDue: string;
  expense: boolean;
  amount: string;
  expenseCategory?: string;
  clientDraft: boolean;
}
export interface CourtDayWorkspace {
  eventId: string;
  version: number;
  state: CourtDayState;
  result: {
    activityId: string;
    nextEventId?: string;
    taskId?: string;
    expenseId?: string;
    draftId?: string;
  } | null;
  completedAt: string | null;
  updatedAt: string | null;
}
export interface CourtDayResponse {
  event: CalendarEventItem & {
    caseId: string;
    updatedAt: string;
    assignee?: { firstName: string; lastName: string } | null;
    case: NonNullable<CalendarEventItem['case']> & {
      leadLawyer: { firstName: string; lastName: string };
    };
  };
  workspace: CourtDayWorkspace;
}
export const courtDayCopy = {
  th: {
    unavailable:
      'มีงานหรือเอกสารที่เคยเลือก แต่ไม่อยู่ในรายการที่คุณเข้าถึงได้ในขณะนี้',
    removeUnavailable: 'นำรายการที่ไม่พบออกจากแฟ้มนี้',
    recovered:
      'กู้คืนข้อมูลที่ยังไม่บันทึกจากแท็บนี้แล้ว กรุณาบันทึกเพื่อให้ทีมเห็น',
    leaveConfirm: 'ออกจากหน้านี้โดยไม่บันทึกการแก้ไขหรือไม่?',
    title: 'แฟ้มไปศาล',
    back: 'My Day',
    case: 'เปิดหน้าคดี',
    prep: 'เตรียมก่อนศาล',
    outcome: 'บันทึกผลนัด',
    review: 'ตรวจงานต่อ',
    loading: 'กำลังเปิดแฟ้มนัดศาล…',
    retry: 'ลองใหม่',
    loadError: 'เปิดแฟ้มไม่สำเร็จ กรุณาลองใหม่',
    attending: 'ผู้ไปศาล',
    checklist: 'รายการเตรียมตัว',
    checklistHelp: 'เช็กความพร้อมของนัดนี้ร่วมกับทีม',
    emptyChecklist: 'เพิ่มสิ่งที่ต้องเตรียม หรือเริ่มจากรายการแนะนำ',
    starter: 'ใช้รายการแนะนำ',
    starters: [
      'ตรวจวัน เวลา และสถานที่นัด',
      'ตรวจเอกสารและสำเนาที่ต้องนำไป',
      'ยืนยันผู้ไปศาลและการเดินทาง',
    ],
    add: 'เพิ่มรายการ',
    newItem: 'สิ่งที่ต้องเตรียม',
    remove: 'ลบรายการ',
    done: 'เสร็จ',
    tasks: 'งานคดีที่ใช้เตรียมนัด',
    tasksHelp: 'เชื่อมงานเดิมเข้ามา สถานะอ้างอิงจากงานจริง',
    noTasks: 'ยังไม่มีงานในคดีนี้',
    openTasks: 'จัดการงานคดี',
    documents: 'เอกสารที่ใช้ในนัดนี้',
    docHelp: 'เลือกฉบับที่ต้องใช้ เปิดหรือดาวน์โหลดขณะออนไลน์',
    noDocs: 'ยังไม่มีเอกสารในคดีนี้',
    upload: 'จัดการเอกสาร',
    open: 'ดาวน์โหลด',
    version: 'ฉบับ',
    newer: 'มีฉบับใหม่',
    notes: 'บันทึกเตรียมนัด',
    notesHelp: 'ประเด็นสำคัญ คำถาม หรือสิ่งที่ต้องยืนยัน ใช้ร่วมกับทีมในคดี',
    saved: 'บันทึกแล้ว',
    unsaved: 'มีการแก้ไขที่ยังไม่บันทึก',
    save: 'บันทึกความพร้อม',
    saving: 'กำลังบันทึก…',
    saveNext: 'บันทึกแล้วไปต่อ',
    next: 'ไปบันทึกผล',
    prev: 'ย้อนกลับ',
    inspect: 'ตรวจรายการก่อนบันทึก',
    resultLabel: 'ผลนัดที่เกิดขึ้นจริง',
    resultHint: 'ศาลสั่งอะไร มีประเด็นใดต้องยืนยัน และต้องทำอะไรต่อ',
    future:
      'ยังไม่ถึงเวลานัด เตรียมแฟ้มไว้ก่อนได้ และบันทึกผลเมื่อเริ่มนัดแล้ว',
    nextHearing: 'มีนัดครั้งหน้า',
    nextTitle: 'ชื่อนัดครั้งหน้า',
    nextAt: 'วันและเวลานัดครั้งหน้า',
    followUp: 'สร้างงานติดตาม',
    taskTitle: 'งานที่ต้องทำต่อ',
    taskDue: 'วันครบกำหนด (ไม่บังคับ)',
    taskOwner: 'คุณเป็นผู้รับผิดชอบงานนี้ ส่งต่อให้ทีมได้จากหน้างาน',
    expenseCategory: 'ประเภทค่าใช้จ่าย',
    expense: 'บันทึกค่าใช้จ่ายเป็นร่าง',
    amount: 'ยอดจริงที่จ่าย (บาท)',
    expenseHelp: 'ยังไม่ส่งเบิกหรือจ่ายเงิน',
    clientDraft: 'เตรียมร่างแจ้งลูกความ',
    draftHelp: 'ใช้ผลนัดที่คุณกรอก ต้องตรวจและอนุมัติแยกก่อนส่ง',
    reviewHelp: 'ตรวจรายการที่จะบันทึก นัดและงานที่เลือกจะถูกสร้างในคดีนี้',
    confirm: 'ยืนยันบันทึกผลนัด',
    complete: 'บันทึกผลนัดเรียบร้อย',
    completeHelp: 'รายการต่อเนื่องอยู่ในคดีแล้ว ไม่ต้องสร้างซ้ำ',
    activitySaved: 'บันทึกความเคลื่อนไหวคดีแล้ว',
    eventSaved: 'เพิ่มนัดครั้งหน้าแล้ว',
    taskSaved: 'สร้างงานติดตามให้คุณแล้ว',
    expenseSaved: 'บันทึกร่างค่าใช้จ่ายแล้ว',
    draftSaved: 'ร่างแจ้งลูกความพร้อมตรวจ',
    draftOpen: 'เปิดตรวจร่าง',
    error: 'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ ลองอีกครั้งได้',
    conflict: 'มีคนแก้ข้อมูลนัดนี้จากอีกหน้าจอ กรุณาตรวจข้อมูลล่าสุดก่อนบันทึก',
    reload: 'โหลดข้อมูลล่าสุด',
    reloadConfirm:
      'แทนที่ข้อมูลที่ยังไม่บันทึกด้วยข้อมูลล่าสุด? คัดลอกบันทึกเก็บไว้ก่อนหากต้องการ',
    copy: 'คัดลอกบันทึกที่กรอก',
    copied: 'คัดลอกแล้ว',
    required: 'กรอกผลนัดและตรวจช่องที่เลือกให้ครบ',
    emptyOutcome: 'ยังไม่ได้กรอกผลนัด',
    nothingSent: 'รอบนี้ยังไม่ส่งข้อความถึงลูกความ',
    timezone: 'เวลาไทย',
  },
  en: {
    unavailable:
      'Some selected tasks or documents are no longer in the list available to you.',
    removeUnavailable: 'Remove unavailable selections',
    recovered:
      'Unsaved entries restored from this tab. Save to share them with your team.',
    leaveConfirm: 'Leave without saving your changes?',
    title: 'Court day',
    back: 'My Day',
    case: 'Open case',
    prep: 'Prepare',
    outcome: 'Record outcome',
    review: 'Review next steps',
    loading: 'Opening the court file…',
    retry: 'Retry',
    loadError: 'Unable to open this appointment. Please retry.',
    attending: 'Attending lawyer',
    checklist: 'Preparation checklist',
    checklistHelp: 'Prepare for this appointment together with your team',
    emptyChecklist: 'Add what you need or start with the suggested checklist',
    starter: 'Use suggested checklist',
    starters: [
      'Check appointment time and location',
      'Check documents and copies to bring',
      'Confirm the attending lawyer and travel',
    ],
    add: 'Add item',
    newItem: 'What to prepare',
    remove: 'Remove item',
    done: 'done',
    tasks: 'Case tasks for this appointment',
    tasksHelp: 'Link existing tasks. Their actual status stays in sync.',
    noTasks: 'No case tasks yet',
    openTasks: 'Manage case tasks',
    documents: 'Documents for this appointment',
    docHelp: 'Choose the version you need. Download while online.',
    noDocs: 'No documents in this case yet',
    upload: 'Manage documents',
    open: 'Download',
    version: 'Version',
    newer: 'Newer version available',
    notes: 'Preparation notes',
    notesHelp:
      'Key points, questions and items to confirm. Shared with the case team.',
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    save: 'Save preparation',
    saving: 'Saving…',
    saveNext: 'Save and continue',
    next: 'Record outcome',
    prev: 'Back',
    inspect: 'Review before recording',
    resultLabel: 'What happened at the hearing',
    resultHint:
      'Record the court’s directions, points to confirm and next actions',
    future:
      'This appointment has not started. Prepare now and record the outcome when it starts.',
    nextHearing: 'Add the next appointment',
    nextTitle: 'Next appointment title',
    nextAt: 'Next appointment date and time',
    followUp: 'Create a follow-up task',
    taskTitle: 'What needs to happen next',
    taskDue: 'Due date (optional)',
    taskOwner:
      'You will own this task. Use the task page to hand it off to your team.',
    expenseCategory: 'Expense category',
    expense: 'Save expense as a draft',
    amount: 'Actual amount paid (THB)',
    expenseHelp: 'No reimbursement submission or payment yet',
    clientDraft: 'Prepare a client update draft',
    draftHelp:
      'Uses the outcome you entered. Review and approve separately before sending.',
    reviewHelp:
      'Check what will be recorded. Selected appointments and tasks will be created in this case.',
    confirm: 'Confirm hearing outcome',
    complete: 'Hearing outcome recorded',
    completeHelp:
      'Your next steps are in the case. No need to create them again.',
    activitySaved: 'Case activity recorded',
    eventSaved: 'Next appointment added',
    taskSaved: 'Follow-up task assigned to you',
    expenseSaved: 'Expense draft saved',
    draftSaved: 'Client update draft ready for review',
    draftOpen: 'Review draft',
    error: 'Could not save. Your entries are still here. You can retry.',
    conflict:
      'This appointment changed in another window. Review the latest version before saving.',
    reload: 'Load latest version',
    reloadConfirm:
      'Replace unsaved entries with the latest version? Copy your notes first if needed.',
    copy: 'Copy your entries',
    copied: 'Copied',
    required: 'Enter the outcome and complete the selected fields',
    emptyOutcome: 'No outcome entered',
    nothingSent: 'No client message has been sent',
    timezone: 'Bangkok time',
  },
};
