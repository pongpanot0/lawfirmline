import type { TourStep } from './types';
import { dashboardTourSteps } from './dashboard-tour-steps';

/** One short tour per route. Steps whose target isn't on the page are dropped silently. */
export const PAGE_TOUR_STEPS: Record<string, TourStep[]> = {
  '/dashboard': dashboardTourSteps,

  '/getting-started': [
    { selector: 'main h1', title: 'เริ่มใช้งานสำนักงาน', body: 'ความคืบหน้าอ้างอิงจากข้อมูลจริง เริ่มด้วยทีม ลูกความ และคดีแรก', placement: 'right' },
    { selector: 'text:ดาวน์โหลดตัวอย่าง CSV', title: 'นำเข้าข้อมูลเดิม', body: 'ดาวน์โหลดแบบฟอร์ม CSV กรอกรายชื่อลูกความ/คดีเดิม แล้วอัปโหลดกลับเข้าระบบได้ทีละหลายรายการ', placement: 'right' },
  ],
  '/my-day': [
    { selector: 'main h1', title: 'วันของฉัน', body: 'สิ่งที่ต้องทำวันนี้-พรุ่งนี้ ทั้งนัดและงาน ในที่เดียว', placement: 'right' },
    { selector: 'text:งานทีม', title: 'สลับดูงานทีม', body: 'ดูงานของตัวเองหรือของทั้งทีมได้', placement: 'bottom' },
  ],
  '/work': [
    { selector: 'placeholder:ค้นชื่องาน', title: 'ค้นหางาน', body: 'ค้นหางานจากชื่องาน คดี เลขอ้างอิง หรือผู้รับผิดชอบ', placement: 'bottom' },
    { selector: 'text:มอบหมายให้ฉัน', title: 'กรองงานของฉัน', body: 'กดเพื่อดูเฉพาะงานที่มอบหมายให้คุณ', placement: 'bottom' },
    { selector: 'text:เพิ่มงานส่วนตัว', title: 'เพิ่มงานส่วนตัว', body: 'งานที่ไม่ผูกกับคดีไหน เพิ่มได้จากปุ่มนี้', placement: 'left' },
  ],
  '/todos': [
    { selector: 'text:เพิ่มงาน', title: 'เพิ่มงานส่วนตัว', body: 'งานที่ไม่ผูกกับคดีไหน เพิ่มได้จากปุ่มนี้', placement: 'left' },
    { selector: 'placeholder:ค้นหาชื่องาน', title: 'ค้นหางาน', body: 'ค้นหางานส่วนตัวจากชื่อได้ที่นี่', placement: 'bottom' },
  ],
  '/calendar': [
    { selector: 'text:เพิ่มนัด', title: 'ปฏิทินสำนักงาน', body: 'ดูนัดรวมทุกคดีทุกทนาย เพิ่มนัดใหม่ได้จากปุ่มนี้', placement: 'bottom' },
  ],
  '/court-schedule': [
    { selector: 'main h1', title: 'ตารางศาล', body: 'ใครไปไหนวันไหน เรียงตามวัน พร้อมเตือนเมื่อมีคนถูกจองซ้อน', placement: 'right' },
    { selector: 'text:เพิ่มนัด', title: 'เพิ่มนัดใหม่', body: 'เพิ่มนัดศาลหรือนัดลูกค้าใหม่จากปุ่มนี้', placement: 'left' },
  ],

  '/cases': [
    { selector: 'placeholder:Own Ref', title: 'ค้นหาคดี', body: 'ค้นหาด้วย Own Ref, Customer Ref, เลขดำ, เลขแดง หรือชื่อลูกค้า', placement: 'bottom' },
    { selector: 'text:สร้างคดีใหม่', title: 'สร้างคดีใหม่', body: 'เปิดคดีใหม่ได้จากปุ่มนี้', placement: 'left' },
  ],
  '/cases/board': [
    { selector: 'main h1', title: 'บอร์ดสถานะคดี', body: 'แยกคดีตามสถานะปัจจุบัน ลากการ์ดคดีข้ามคอลัมน์เพื่อเปลี่ยนสถานะ หรือกดเพื่อเปิดคดี', placement: 'right' },
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
    { selector: 'main h1', title: 'เพิ่มลูกค้า', body: 'บุคคลกรอกชื่อครั้งเดียว นิติบุคคลเพิ่มผู้ติดต่อได้หลายคน', placement: 'right' },
    { selector: 'placeholder:นายสมชาย', title: 'ชื่อลูกค้า', body: 'กรอกชื่อลูกค้า แล้วเลือกประเภทบุคคลธรรมดา/นิติบุคคลด้านบน', placement: 'right' },
  ],

  '/documents': [
    { selector: 'main h1', title: 'เอกสาร', body: 'จัดการเอกสารแยกตามคดี เลือกหมวดเพื่อดูเอกสารประเภทนั้นทุกคดี', placement: 'right' },
    { selector: 'placeholder:ค้นหาเอกสาร', title: 'ค้นหาเอกสาร', body: 'ค้นหาเอกสารข้ามคดีได้จากตรงนี้', placement: 'top' },
  ],
  '/expenses': [
    { selector: 'text:เพิ่มค่าใช้จ่าย', title: 'บันทึกค่าใช้จ่ายใหม่', body: 'บันทึกรายการค่าใช้จ่ายที่จ่ายไปก่อนได้จากปุ่มนี้', placement: 'left' },
    { selector: 'text:จัดทำใบเบิก', title: 'จัดทำใบเบิก', body: 'เลือกรายการที่พร้อมเบิกแล้วกดปุ่มนี้ เพื่อรวมเป็นใบเบิกส่งขออนุมัติ', placement: 'right' },
  ],
  '/expenses/new': [
    { selector: 'placeholder:จำนวนเงิน', title: 'เพิ่มค่าใช้จ่าย', body: 'กรอกจำนวนเงิน เลือกประเภท และรายละเอียด แนบรูปใบเสร็จได้ถ้ามี', placement: 'right' },
  ],
  '/expenses/claim': [
    { selector: 'text:กลับไปหน้าค่าใช้จ่าย', title: 'ใบเบิกค่าใช้จ่าย', body: 'รวมรายการที่เลือกไว้เป็นใบเบิกฉบับเดียว พิมพ์หรือส่งขออนุมัติได้จากหน้านี้', placement: 'right' },
  ],
  '/invoices': [
    { selector: 'main h1', title: 'ใบแจ้งหนี้', body: '20 ใบล่าสุดจากคดี เรื่องรับเข้า และใบที่ออกก่อนรับงาน ตามสิทธิ์ที่คุณดูได้', placement: 'right' },
    { selector: 'placeholder:บริษัทผู้จ่าย', title: 'ค้นหาใบแจ้งหนี้', body: 'ค้นหาจากบริษัทผู้จ่าย เลขบิล หรือเลขคดีได้', placement: 'bottom' },
  ],

  '/reports': [
    { selector: 'main h1', title: 'รายงาน', body: 'ข้อมูลวิเคราะห์ของสำนักงาน อัตราปิดคดี กำไรสุทธิ และกำไรแยกรายคดี', placement: 'right' },
  ],
  '/knowledge': [
    { selector: 'main h1', title: 'คลังความรู้คดี', body: 'สรุปและข้อมูลเชิงลึกจาก AI ของคดีที่ผ่านมา ใช้อ้างอิงกับคดีใหม่ได้', placement: 'right' },
    { selector: 'placeholder:ค้นหาสรุป', title: 'ค้นหาสรุปคดี', body: 'ค้นหาสรุปคดีที่ผ่านมาได้จากตรงนี้', placement: 'bottom' },
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
    { selector: 'text:เพิ่มประเภท', title: 'ประเภทคดี', body: 'จัดการหมวดหมู่คดีของสำนักงาน กำหนดฟิลด์เฉพาะที่จะให้กรอกตอนสร้างคดีใหม่', placement: 'bottom' },
  ],
  '/admin/courts': [
    { selector: 'main h1', title: 'ทะเบียนศาล', body: 'จัดการรายชื่อศาลที่ใช้เลือกตอนสร้างคดีและตั้งนัด', placement: 'right' },
  ],
  '/admin/deadline-rules': [
    { selector: 'main h1', title: 'กฎวันครบกำหนด', body: 'ตั้งกฎให้ระบบคำนวณเดดไลน์อัตโนมัติตามประเภทคดี/เหตุการณ์', placement: 'right' },
  ],
  '/admin/holidays': [
    { selector: 'main h1', title: 'วันหยุดราชการ', body: 'รายการวันหยุดที่ระบบใช้นับวันทำการตอนคำนวณกำหนดส่งงาน', placement: 'right' },
  ],
  '/admin/reimbursements': [
    { selector: 'main h1', title: 'เบิกค่าใช้จ่าย', body: 'ตรวจสอบและอนุมัติค่าใช้จ่ายที่ทีมส่งเข้ามา รวมถึงให้เงินสำรองจ่ายล่วงหน้าได้', placement: 'right' },
    { selector: 'text:รออนุมัติ', title: 'กรองตามสถานะ', body: 'กรองรายการเบิกจ่ายตามสถานะได้', placement: 'bottom' },
  ],
  '/admin/audit-log': [
    { selector: 'main h1', title: 'บันทึกการใช้งาน', body: 'ประวัติการกระทำสำคัญในระบบ ใครทำอะไรเมื่อไหร่', placement: 'right' },
  ],
};
