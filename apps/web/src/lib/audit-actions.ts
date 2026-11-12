export const AUDIT_ACTIONS: Record<string, string> = {
  'mcp.connect': 'เชื่อมต่อ AI', 'mcp.disconnect': 'ยกเลิกการเชื่อมต่อ AI', 'mcp.settings': 'เปลี่ยนการตั้งค่าการเชื่อมต่อ AI',
  'mcp.create_task': 'สร้างงานผ่าน AI', 'mcp.complete_task': 'ปิดงานผ่าน AI', 'mcp.add_case_note': 'ลงโน้ตในคดีผ่าน AI',
  'mcp.log_time': 'ลงเวลาผ่าน AI', 'mcp.propose_court_date': 'เสนอวันนัดศาลผ่าน AI', 'mcp.draft_expense': 'ร่างรายการเบิกผ่าน AI', 'mcp.request_leave': 'ยื่นลาผ่าน AI', 'mcp.draft_notice': 'ร่างหนังสือทวงถามผ่าน AI', 'mcp.create_sop': 'สร้าง SOP ผ่าน AI', 'mcp.create_workflow': 'สร้างชุดขั้นตอนงานผ่าน AI',
  USER_LOGIN: 'เข้าสู่ระบบ', USER_INVITED: 'เชิญสมาชิกเข้าทีม', INVITATION_ACCEPTED: 'ตอบรับคำเชิญ', INVITATION_CANCELLED: 'ยกเลิกคำเชิญ',
  MEMBER_REMOVED: 'นำสมาชิกออกจากทีม', MEMBER_ROLE_CHANGED: 'เปลี่ยนบทบาทสมาชิก', MEMBER_WORK_SETTINGS_UPDATED: 'เปลี่ยนการตั้งค่างานของสมาชิก',
  CASE_DELETED: 'ลบคดี', CASE_OWNER_CHANGED: 'เปลี่ยนผู้รับผิดชอบคดี', CASE_MESSAGE_SENT: 'ส่งข้อความในคดี', CASES_IMPORTED_EXCEL: 'นำเข้าคดี',
  CASE_PARTICIPANT_ADDED: 'เพิ่มผู้เกี่ยวข้องในคดี', CASE_PARTICIPANT_UPDATED: 'แก้ไขผู้เกี่ยวข้องในคดี', CASE_PARTICIPANT_REMOVED: 'นำผู้เกี่ยวข้องออกจากคดี',
  DOCUMENT_UPLOADED: 'เพิ่มเอกสาร', DOCUMENT_VERSION_UPLOADED: 'เพิ่มเอกสารฉบับใหม่', DOCUMENT_DOWNLOADED: 'ดาวน์โหลดเอกสาร', DOCUMENT_VISIBILITY_CHANGED: 'เปลี่ยนสิทธิ์เข้าถึงเอกสาร', DOCUMENT_READ: 'เปิดเอกสาร',
  CLIENT_DELETED: 'ลบลูกความ', CLIENT_PORTAL_ACCESS: 'เข้าใช้งานพอร์ทัลลูกความ', CLIENT_PORTAL_LOGIN: 'เข้าสู่ระบบพอร์ทัล', CLIENT_PORTAL_INVITE_SENT: 'ส่งคำเชิญเข้าพอร์ทัลลูกความ', CLIENT_PORTAL_INVITE_ACCEPTED: 'ตอบรับคำเชิญเข้าพอร์ทัลลูกความ',
  TASK_CHANGED: 'แก้ไขงาน', TASK_AI_ANALYZED: 'วิเคราะห์งานด้วยผู้ช่วย AI', EVENT_RESCHEDULED: 'เปลี่ยนวันนัด', COURT_DAY_RECORDED: 'บันทึกวันขึ้นศาล',
  EMAIL_INTAKE_AI_EXTRACTED: 'สรุปอีเมล', EMAIL_THREAD_LINKED: 'ผูกอีเมลกับคดี', EMAIL_THREAD_UNLINKED: 'ยกเลิกการผูกอีเมลกับคดี',
  CASE_FOLDER_LINKED: 'ผูกโฟลเดอร์กับคดี', CASE_FOLDER_UNLINKED: 'ยกเลิกการผูกโฟลเดอร์', LAWYER_LICENSE_UPDATED: 'แก้ไขใบอนุญาต', FIRM_REF_PREFIX_UPDATED: 'แก้ไขคำนำหน้าเลขคดี',
  SUBSCRIPTION_CANCEL_REQUESTED: 'ขอยกเลิกแพ็กเกจ', FIRM_REGISTERED: 'ลงทะเบียนสำนักงาน', DATA_IMPORT_COMMITTED: 'นำเข้าข้อมูล', DATA_IMPORT_UNDONE: 'ยกเลิกการนำเข้าข้อมูล',
};

export const auditActionText = (code: string) => AUDIT_ACTIONS[code] ?? `ทำรายการ ${code}`;
