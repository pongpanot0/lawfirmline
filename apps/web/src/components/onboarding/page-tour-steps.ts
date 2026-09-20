import type { TourStep } from './types';
import { dashboardTourSteps } from './dashboard-tour-steps';

/** One short tour per route. Steps whose target isn't on the page are dropped silently. */
export const PAGE_TOUR_STEPS: Record<string, TourStep[]> = {
  '/dashboard': dashboardTourSteps,

  '/getting-started': [
    { selector: 'text:Download CSV', title: 'นำเข้าข้อมูลเดิม', body: 'ดาวน์โหลดแบบฟอร์ม CSV กรอกรายชื่อคดี/ลูกค้าเดิม แล้วอัปโหลดกลับเข้าระบบ', placement: 'right' },
    { selector: 'text:Preview', title: 'ดูตัวอย่างก่อนนำเข้าจริง', body: 'ระบบให้ตรวจตัวอย่างเสมอก่อนบันทึกข้อมูลจริง', placement: 'bottom' },
  ],
  '/my-day': [
    { selector: 'text:เพิ่มนัด', title: 'วันของฉัน', body: 'สรุปนัดและงานที่ต้องทำวันนี้ กดเพิ่มนัดใหม่ได้จากตรงนี้', placement: 'bottom' },
  ],
  '/work': [
    { selector: 'placeholder:ค้นชื่องาน', title: 'ค้นหางาน', body: 'ค้นหางานจากชื่องาน คดี เลขอ้างอิง หรือผู้รับผิดชอบ', placement: 'bottom' },
    { selector: 'text:มอบหมายให้ฉัน', title: 'กรองงานของฉัน', body: 'กดเพื่อดูเฉพาะงานที่มอบหมายให้คุณ', placement: 'bottom' },
    { selector: 'text:เพิ่มงานส่วนตัว', title: 'เพิ่มงานส่วนตัว', body: 'งานที่ไม่ผูกกับคดีไหน เพิ่มได้จากปุ่มนี้', placement: 'left' },
  ],
  '/todos': [
    { selector: 'placeholder:Todo title', title: 'เพิ่มงานส่วนตัว', body: 'พิมพ์ชื่องานแล้วกด Enter เพื่อเพิ่มรายการใหม่', placement: 'bottom' },
  ],
  '/calendar': [
    { selector: 'text:เพิ่มนัด', title: 'ปฏิทินสำนักงาน', body: 'ดูนัดรวมทุกคดีทุกทนาย เพิ่มนัดใหม่ได้จากปุ่มนี้', placement: 'bottom' },
  ],
  '/court-schedule': [
    { selector: 'text:Add Event', title: 'ตารางศาล', body: 'เพิ่มนัดศาลหรือนัดลูกค้าใหม่จากปุ่มนี้', placement: 'left' },
    { selector: 'text:Month', title: 'สลับมุมมอง', body: 'สลับดูแบบวัน สัปดาห์ หรือเดือนได้', placement: 'bottom' },
  ],

  '/cases': [
    { selector: 'placeholder:Own Ref', title: 'ค้นหาคดี', body: 'ค้นหาด้วย Own Ref, Customer Ref, เลขดำ, เลขแดง หรือชื่อลูกค้า', placement: 'bottom' },
    { selector: 'text:สร้างคดีใหม่', title: 'สร้างคดีใหม่', body: 'เปิดคดีใหม่ได้จากปุ่มนี้', placement: 'left' },
  ],
  '/cases/board': [
    { selector: 'text:ลากการ์ดคดี', title: 'บอร์ดสถานะคดี', body: 'ลากการ์ดคดีข้ามคอลัมน์เพื่อเปลี่ยนสถานะได้ทันที', placement: 'right' },
  ],
  '/cases/new': [
    { selector: 'text:Litigation', title: 'สร้างคดีใหม่', body: 'เลือกประเภทคดีก่อน ระบบจะปรับฟิลด์ขั้นถัดไปให้ตรงกับประเภทที่เลือก', placement: 'right' },
  ],
  '/cases/:id': [
    { selector: 'main h1', title: 'รายละเอียดคดี', body: 'ชื่อคดี เลขอ้างอิง สถานะ และผู้รับผิดชอบของคดีนี้', placement: 'right' },
    { selector: 'text:งาน', title: 'แท็บงาน', body: 'ดูและมอบหมายงานย่อยของคดีนี้', placement: 'bottom' },
    { selector: 'text:เอกสาร', title: 'แท็บเอกสาร', body: 'อัปโหลดและจัดเวอร์ชันเอกสารของคดีนี้', placement: 'bottom' },
    { selector: 'text:ค่าใช้จ่าย', title: 'แท็บการเงิน', body: 'บันทึกเวลาทำงาน ค่าใช้จ่าย และออกใบแจ้งหนี้ของคดีนี้', placement: 'bottom' },
  ],

  '/clients': [
    { selector: 'placeholder:ค้นหาลูกค้า', title: 'ค้นหาลูกค้า', body: 'ค้นหาลูกค้าจากชื่อได้ที่นี่', placement: 'bottom' },
    { selector: 'text:เพิ่มลูกค้า', title: 'เพิ่มลูกค้าใหม่', body: 'สร้างลูกค้าใหม่พร้อมผู้ติดต่อได้จากปุ่มนี้', placement: 'left' },
  ],
  '/clients/new': [
    { selector: 'placeholder:บริษัท ABC', title: 'ชื่อลูกค้า', body: 'กรอกชื่อลูกค้า เลือกประเภทบุคคล/นิติบุคคล แล้วเพิ่มผู้ติดต่อได้หลายคน', placement: 'right' },
  ],

  '/documents': [
    { selector: 'placeholder:Search documents', title: 'คลังเอกสารรวม', body: 'ค้นหาเอกสารข้ามคดี กรองตามคดี และอัปโหลดใหม่ได้ที่นี่', placement: 'bottom' },
  ],
  '/expenses': [
    { selector: 'text:Submit for Approval', title: 'ค่าใช้จ่าย', body: 'บันทึกค่าใช้จ่ายแล้วส่งขออนุมัติได้จากตรงนี้', placement: 'right' },
  ],
  '/expenses/new': [
    { selector: 'placeholder:Description', title: 'บันทึกค่าใช้จ่ายใหม่', body: 'กรอกยอดเงินและรายละเอียด แนบใบเสร็จได้ถ้ามี', placement: 'right' },
  ],
  '/expenses/claim': [
    { selector: 'text:Print', title: 'แบบฟอร์มเบิกค่าใช้จ่าย', body: 'รวมรายการที่เป็นร่างเป็นแบบฟอร์มเดียว พิมพ์หรือส่งขออนุมัติทีเดียวได้', placement: 'right' },
  ],
  '/invoices': [
    { selector: 'text:New Invoice', title: 'ใบแจ้งหนี้', body: 'ออกใบแจ้งหนี้ใหม่จากชั่วโมงทำงานและค่าใช้จ่ายที่บันทึกไว้', placement: 'left' },
  ],

  '/reports': [
    { selector: 'text:Export All', title: 'รายงาน', body: 'ส่งออกรายงานภาพรวมสำนักงานทั้งหมดได้จากปุ่มนี้', placement: 'left' },
  ],
  '/knowledge': [
    { selector: 'placeholder:Search summaries', title: 'คลังความรู้', body: 'ค้นหาสรุปคดีที่ผ่านมา ใช้อ้างอิงกับคดีใหม่ได้', placement: 'bottom' },
  ],
  '/team': [
    { selector: 'text:ส่งคำเชิญ', title: 'จัดการทีม', body: 'กรอกอีเมลและเลือกบทบาท แล้วเชิญสมาชิกใหม่เข้าสำนักงานได้', placement: 'right' },
  ],
  '/account/billing': [
    { selector: 'text:สมัคร', title: 'แพ็กเกจและการชำระเงิน', body: 'ดูแพ็กเกจปัจจุบันและเปลี่ยนแพ็กเกจได้ที่นี่', placement: 'right' },
  ],
  '/ai-usage': [
    { selector: 'main h1', title: 'การใช้งาน AI', body: 'ติดตามว่าใครในทีมเรียกใช้ฟีเจอร์ AI มากน้อยแค่ไหน', placement: 'right' },
  ],
  '/sops': [
    { selector: 'placeholder:ค้นหา SOP', title: 'SOP / คู่มือการทำงาน', body: 'คลังขั้นตอนมาตรฐานของสำนักงาน ค้นหาได้จากตรงนี้', placement: 'bottom' },
  ],
  '/playbooks': [
    { selector: 'main h1', title: 'Playbooks', body: 'กำหนดชุดงานมาตรฐานของคดีแต่ละประเภท แล้วนำไปใช้ตอนเปิดคดีใหม่ได้', placement: 'right' },
  ],
  '/operations': [
    { selector: 'main h1', title: 'ภาระงานทีม', body: 'ดูภาระงานของทุกคนในทีม แล้วมอบหมายงานเพิ่มให้สมดุลได้จากหน้านี้', placement: 'right' },
  ],
  '/settings': [
    { selector: '[data-tour="settings-link"]', title: 'ตั้งค่าและ LINE', body: 'แก้ไขโปรไฟล์ สลับธีม และเชื่อมต่อ LINE ส่วนตัวเพื่อรับแจ้งเตือนนัดหมายได้ที่นี่', placement: 'left' },
  ],

  '/intake': [
    { selector: 'text:สร้างใหม่', title: 'รับเรื่อง', body: 'คัดกรองเรื่องที่ลูกค้าติดต่อเข้ามาก่อนตัดสินใจเปิดเป็นคดี', placement: 'left' },
  ],
  '/intake/new': [
    { selector: 'placeholder:เลขเคลม', title: 'รับเรื่องใหม่', body: 'กรอกหัวข้อเรื่องและวางข้อความจากอีเมล/แชทของลูกค้า ระบบช่วยสรุปข้อเท็จจริงให้', placement: 'right' },
  ],
  '/intake/portal-submissions': [
    { selector: 'main h1', title: 'เรื่องจาก Customer Portal', body: 'คำขอที่ลูกค้ากรอกเข้ามาเองผ่าน Client Portal ตรวจแล้วแปลงเป็นเรื่องรับเข้าได้', placement: 'right' },
  ],
  '/email-intake': [
    { selector: 'main h1', title: 'รับเรื่องจากอีเมล', body: 'อีเมลที่ดึงมาจากกล่องที่เชื่อมต่อไว้ AI ช่วยเสนอข้อมูลคดีให้ตรวจสอบก่อนรับเข้า', placement: 'right' },
  ],

  '/admin/case-types': [
    { selector: 'text:Add Type', title: 'ประเภทคดี', body: 'กำหนดประเภทคดีและฟิลด์เฉพาะที่จะให้กรอกตอนสร้างคดีใหม่', placement: 'left' },
  ],
  '/admin/courts': [
    { selector: 'text:Add Court', title: 'ทะเบียนศาล', body: 'จัดการรายชื่อศาลที่ใช้เลือกตอนสร้างคดีและตั้งนัด', placement: 'left' },
  ],
  '/admin/deadline-rules': [
    { selector: 'main h1', title: 'กฎวันครบกำหนด', body: 'ตั้งกฎให้ระบบคำนวณเดดไลน์อัตโนมัติตามประเภทคดี/เหตุการณ์', placement: 'right' },
  ],
  '/admin/holidays': [
    { selector: 'main h1', title: 'วันหยุดราชการ', body: 'รายการวันหยุดที่ระบบใช้นับวันทำการตอนคำนวณกำหนดส่งงาน', placement: 'right' },
  ],
  '/admin/reimbursements': [
    { selector: 'text:PENDING', title: 'อนุมัติการเบิกจ่าย', body: 'คิวอนุมัติค่าใช้จ่ายที่ทีมส่งเข้ามา กรองตามสถานะแล้วอนุมัติ/ปฏิเสธได้', placement: 'bottom' },
  ],
  '/admin/audit-log': [
    { selector: 'main h1', title: 'บันทึกการใช้งาน', body: 'ประวัติการกระทำสำคัญในระบบ ใครทำอะไรเมื่อไหร่', placement: 'right' },
  ],
};
