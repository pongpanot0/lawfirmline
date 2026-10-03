// Default playbooks (task templates) seeded per firm for each default case type.
// offsetDays = internal target counted from the day the case enters `stage`,
// kept inside the legal deadline cited in `instructions`.
// Sources and unverified points: docs/research/2026-09-28-default-courts-and-playbooks.md
import type { CaseStage, FirmRole } from './index';
import type { TaskRoutineDefinition } from './task-routine';

export interface DefaultPlaybookStep {
  routine?: TaskRoutineDefinition;
  title: string;
  instructions: string;
  primaryRole?: `${FirmRole}`;
  secondaryRole?: `${FirmRole}`;
  stage?: `${CaseStage}`;
  offsetDays?: number;
  dayBasis?: 'CALENDAR' | 'BUSINESS';
}

export interface DefaultPlaybookDefinition {
  key: string;
  name: string;
  /** Case-type names to link to, current Thai default first; later entries are the
   * English defaults firms got before 2026-07-25. */
  caseTypeNames: string[];
  steps: DefaultPlaybookStep[];
}

export const DEFAULT_PLAYBOOKS: DefaultPlaybookDefinition[] = [
  // ───────────────────────────── คดีแพ่ง ─────────────────────────────
  {
    key: 'DEFAULT_CIVIL',
    name: 'คดีแพ่งมาตรฐาน (ศาลชั้นต้น–ฎีกา–บังคับคดี)',
    caseTypeNames: ['คดีความ', 'Litigation'],
    steps: [
      {
        title: 'ตรวจสอบผลประโยชน์ขัดกัน (Conflict check)',
        instructions: 'ค้นชื่อลูกความ คู่กรณี และผู้เกี่ยวข้องในระบบก่อนรับงาน ตามข้อบังคับสภาทนายความว่าด้วยมรรยาททนายความ พ.ศ. 2529 (ห้ามรับว่าความให้ทั้งสองฝ่าย)',
        primaryRole: 'ASSISTANT', secondaryRole: 'OWNER', stage: 'INTAKE_REVIEW', offsetDays: 1, dayBasis: 'BUSINESS',
      },
      {
        title: 'ประเมินอายุความและเขตอำนาจศาล',
        instructions: 'ตรวจอายุความตาม ป.พ.พ. บรรพ 1 ลักษณะ 6 (เช่น ทั่วไป 10 ปี ม.193/30, ละเมิด 1 ปี ม.448) และศาลที่มีเขตอำนาจตาม ป.วิ.พ. ม.4; หากใกล้ขาดอายุความให้แจ้งหุ้นส่วนทันที',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'INTAKE_REVIEW', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ออกใบเสนอราคา/สัญญาจ้างว่าความและรับใบแต่งทนาย',
        instructions: 'ทำสัญญาจ้าง ค่าวิชาชีพ และให้ลูกความลงนามใบแต่งทนายความ (ป.วิ.พ. ม.61) ก่อนดำเนินการในศาล',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'ASSISTANT', stage: 'INTAKE_REVIEW', offsetDays: 5, dayBasis: 'BUSINESS',
      },
      {
        title: 'รวบรวมเอกสารและพยานหลักฐานจากลูกความ',
        instructions: 'ขอสัญญา ใบแจ้งหนี้ หนังสือโต้ตอบ หนังสือรับรองนิติบุคคล สำเนาบัตร และรายชื่อพยานบุคคล จัดทำสารบัญเอกสาร',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FACT_GATHERING', offsetDays: 7, dayBasis: 'CALENDAR',
      },
      {
        title: 'สรุปข้อเท็จจริงและประเด็นข้อกฎหมาย',
        instructions: 'จัดทำบันทึกลำดับเหตุการณ์ ประเด็นพิพาท ภาระการพิสูจน์ (ป.วิ.พ. ม.84/1) และความเห็นเรื่องโอกาสชนะคดีเสนอผู้รับผิดชอบ',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FACT_GATHERING', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'ส่งหนังสือบอกกล่าวทวงถาม',
        instructions: 'ส่งไปรษณีย์ลงทะเบียนตอบรับ กำหนดระยะเวลาชำระ (ป.พ.พ. ม.204 ทำให้ลูกหนี้ผิดนัด; กรณีจำนอง ม.728 ต้องบอกกล่าวไม่น้อยกว่า 60 วัน, ผู้ค้ำประกัน ม.686 ต้องแจ้งภายใน 60 วันนับแต่ลูกหนี้ผิดนัด)',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'PRE_LITIGATION', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ติดตามผลทวงถามและเจรจาก่อนฟ้อง',
        instructions: 'บันทึกวันลูกหนี้รับหนังสือ (ใบตอบรับ) และผลการเจรจา; หากไม่ชำระภายในกำหนดให้เสนอฟ้อง',
        primaryRole: 'LAWYER', stage: 'PRE_LITIGATION', offsetDays: 30, dayBasis: 'CALENDAR',
      },
      {
        title: 'ร่างคำฟ้องและบัญชีท้ายฟ้อง',
        instructions: 'ร่างคำฟ้องให้มีสาระครบตาม ป.วิ.พ. ม.172 (สภาพแห่งข้อหา คำขอบังคับ ข้ออ้างที่อาศัย) พร้อมคำนวณทุนทรัพย์และดอกเบี้ย เสนอทนายอาวุโสตรวจ',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FILING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
      {
        title: 'ยื่นฟ้องผ่าน e-Filing และชำระค่าธรรมเนียมศาล',
        instructions: 'ยื่นคำฟ้องผ่านระบบ CIOS/e-Filing ของศาลยุติธรรม ชำระค่าขึ้นศาลตามตาราง 1 ท้าย ป.วิ.พ. และเก็บใบเสร็จ/เลขคดีดำเข้าแฟ้ม',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FILING', offsetDays: 10, dayBasis: 'BUSINESS',
      },
      {
        title: 'ร้องขอให้ส่งหมายเรียกและสำเนาคำฟ้อง',
        instructions: 'ต้องร้องขอต่อเจ้าพนักงานและเสียค่าส่งหมายภายใน 7 วันนับแต่ยื่นฟ้อง (ป.วิ.พ. ม.173) มิฉะนั้นอาจถือเป็นทิ้งฟ้อง (ม.174(1)); ติดตามผลการส่งหมาย',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FILING', offsetDays: 12, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)',
        instructions: 'ต้องยื่นภายใน 15 วันนับแต่ได้รับหมายเรียก (ป.วิ.พ. ม.177); หากส่งโดยปิดหมาย/วิธีอื่น หมายมีผลเมื่อพ้น 15 วัน (ม.79) รวมราว 30 วัน — นับจากวันรับหมายจริงเสมอ หรือยื่นคำร้องขอขยายเวลาก่อนครบกำหนด (ม.23)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'ANSWER', offsetDays: 10, dayBasis: 'CALENDAR',
      },
      {
        title: 'ขอให้ศาลพิพากษาโดยขาดนัดยื่นคำให้การ (ฝ่ายโจทก์)',
        instructions: 'หากจำเลยไม่ยื่นคำให้การ โจทก์ต้องมีคำขอภายใน 15 วันนับแต่พ้นกำหนดยื่นคำให้การ (ป.วิ.พ. ม.197–198) มิฉะนั้นศาลอาจจำหน่ายคดีฐานทิ้งฟ้อง',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'ANSWER', offsetDays: 25, dayBasis: 'CALENDAR',
      },
      {
        title: 'เตรียมกรอบการไกล่เกลี่ยและขออำนาจลูกความ',
        instructions: 'สรุปทางเลือกและวงเงินที่ลูกความยอมรับเป็นลายลักษณ์อักษร ก่อนเข้าไกล่เกลี่ยในศาล (ป.วิ.พ. ม.20 ตรี); สัญญาประนีประนอมยอมความต้องให้ลูกความ/ทนายที่มีอำนาจลงนาม',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'LAWYER', stage: 'MEDIATION', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ยื่นบัญชีระบุพยานและสำเนาเอกสาร',
        instructions: 'ยื่นก่อนวันสืบพยานไม่น้อยกว่า 7 วัน พร้อมสำเนาสำหรับคู่ความ (ป.วิ.พ. ม.88, ม.90); ตั้งเตือนนับถอยหลังจากวันสืบพยานที่ศาลนัด',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'HEARING', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'เตรียมพยานและบันทึกถ้อยคำยืนยันข้อเท็จจริง',
        instructions: 'ซักซ้อมพยาน จัดทำบันทึกถ้อยคำแทนการซักถามตาม ป.วิ.พ. ม.120/1 (ยื่นก่อนวันสืบพยานไม่น้อยกว่า 7 วัน) และขอหมายเรียกพยานที่ไม่มาเอง',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'HEARING', offsetDays: 7, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นคำแถลงการณ์ปิดคดี (ถ้ามี)',
        instructions: 'ยื่นภายในกำหนดที่ศาลอนุญาต (ป.วิ.พ. ม.186) และแจ้งลูกความวันนัดฟังคำพิพากษา',
        primaryRole: 'LAWYER', stage: 'AWAITING_JUDGMENT', offsetDays: 7, dayBasis: 'CALENDAR',
      },
      {
        title: 'ฟังคำพิพากษาและขอคัดถ่ายคำพิพากษา',
        instructions: 'เข้าฟังคำพิพากษา ขอคัดสำเนารับรอง และรายงานผลพร้อมความเห็นเรื่องอุทธรณ์ให้ลูกความภายในวันทำการถัดไป',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'AWAITING_JUDGMENT', offsetDays: 0, dayBasis: 'BUSINESS',
      },
      {
        title: 'ร่างและยื่นอุทธรณ์',
        instructions: 'ยื่นภายใน 1 เดือนนับแต่วันอ่านคำพิพากษา พร้อมค่าธรรมเนียมและเงินค่าธรรมเนียมที่ต้องใช้แทน (ป.วิ.พ. ม.229); ตรวจข้อจำกัดอุทธรณ์ข้อเท็จจริงตามทุนทรัพย์ (ม.224)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'APPEAL', offsetDays: 21, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นคำร้องขออนุญาตฎีกาพร้อมคำฟ้องฎีกา',
        instructions: 'ฎีกาต้องได้รับอนุญาต ยื่นคำร้องพร้อมคำฟ้องฎีกาภายใน 1 เดือนนับแต่อ่านคำพิพากษาศาลอุทธรณ์ (ป.วิ.พ. ม.247–248, ม.229 ประกอบ ม.252) ระบุเหตุตาม ม.249',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'LAWYER', stage: 'SUPREME', offsetDays: 21, dayBasis: 'CALENDAR',
      },
      {
        title: 'ขอออกหมายบังคับคดีและตั้งเจ้าพนักงานบังคับคดี',
        instructions: 'เมื่อพ้นกำหนดตามคำบังคับ (ป.วิ.พ. ม.272) ยื่นคำขอออกหมายบังคับคดี (ม.275–276); ต้องบังคับคดีภายใน 10 ปีนับแต่วันมีคำพิพากษา (ม.274)',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'ENFORCEMENT', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'สืบหาทรัพย์และแถลงยึด/อายัดทรัพย์ลูกหนี้',
        instructions: 'ตรวจโฉนด ทะเบียนรถ บัญชีเงินฝาก สิทธิเรียกร้อง แล้วนำเจ้าพนักงานบังคับคดียึด/อายัด พร้อมวางค่าใช้จ่ายตามที่กรมบังคับคดีกำหนด',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'ENFORCEMENT', offsetDays: 30, dayBasis: 'CALENDAR',
      },
      {
        title: 'รายงานผลคดีและปิดแฟ้ม',
        instructions: 'ส่งรายงานสรุปผลและใบแจ้งหนี้ค่าวิชาชีพคงค้างให้ลูกความ คืนเอกสารต้นฉบับ และอนุมัติปิดแฟ้ม',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'OWNER', stage: 'CLOSING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
    ],
  },

  // ───────────────────────────── คดีอาญา ─────────────────────────────
  {
    key: 'DEFAULT_CRIMINAL',
    name: 'คดีอาญามาตรฐาน (ผู้เสียหาย/จำเลย)',
    caseTypeNames: ['คดีอาญา', 'Criminal'],
    steps: [
      {
        title: 'ตรวจสอบผลประโยชน์ขัดกัน (Conflict check)',
        instructions: 'ค้นชื่อลูกความ คู่กรณี ผู้ต้องหาร่วม และผู้เสียหายในระบบก่อนรับงาน ตามข้อบังคับสภาทนายความว่าด้วยมรรยาททนายความ',
        primaryRole: 'ASSISTANT', secondaryRole: 'OWNER', stage: 'INTAKE_REVIEW', offsetDays: 0, dayBasis: 'BUSINESS',
      },
      {
        title: 'ตรวจอายุความและกำหนดร้องทุกข์',
        instructions: 'ความผิดอันยอมความได้ต้องร้องทุกข์ภายใน 3 เดือนนับแต่รู้เรื่องความผิดและรู้ตัวผู้กระทำ (ป.อ. ม.96); ตรวจอายุความฟ้องคดีตาม ป.อ. ม.95',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'INTAKE_REVIEW', offsetDays: 1, dayBasis: 'BUSINESS',
      },
      {
        title: 'ทำสัญญาจ้างและใบแต่งทนายความ',
        instructions: 'ทำสัญญาค่าวิชาชีพ และรับใบแต่งทนายความ/หนังสือมอบอำนาจจากลูกความ (หรือผู้มีอำนาจกระทำการแทนผู้เสียหายตาม ป.วิ.อ. ม.5–6)',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'ASSISTANT', stage: 'INTAKE_REVIEW', offsetDays: 2, dayBasis: 'BUSINESS',
      },
      {
        title: 'รวบรวมพยานหลักฐานและลำดับเหตุการณ์',
        instructions: 'เก็บเอกสาร ภาพ/คลิป ข้อความแชท (สำรองพร้อมข้อมูลวันเวลา) รายชื่อพยาน และสำนวนที่เกี่ยวข้อง จัดทำบันทึกข้อเท็จจริง',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FACT_GATHERING', offsetDays: 5, dayBasis: 'CALENDAR',
      },
      {
        title: 'ร้องทุกข์/เข้าพบพนักงานสอบสวนพร้อมลูกความ',
        instructions: 'ผู้เสียหาย: ร้องทุกข์ตาม ป.วิ.อ. ม.123; ผู้ต้องหา: ทนายเข้าฟังการสอบปากคำได้ (ม.7/1, ม.134/3) และขอสำเนาบันทึกคำให้การ (ม.7/1)',
        primaryRole: 'LAWYER', stage: 'FACT_GATHERING', offsetDays: 7, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นคำร้องขอปล่อยชั่วคราว (ถ้าลูกความถูกควบคุม)',
        instructions: 'เตรียมหลักประกันและยื่นคำร้องตาม ป.วิ.อ. ม.106–108 ทันที; ผู้ถูกจับต้องถูกนำตัวไปศาลภายใน 48 ชั่วโมง (ม.87) ให้ติดตามคำร้องฝากขัง',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'PRE_LITIGATION', offsetDays: 0, dayBasis: 'CALENDAR',
      },
      {
        title: 'ติดตามความคืบหน้าสำนวนสอบสวน/อัยการ',
        instructions: 'ติดต่อพนักงานสอบสวน/พนักงานอัยการ ยื่นหนังสือขอความเป็นธรรมหรือพยานเพิ่มเติม และบันทึกนัดส่งตัวฟ้อง',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'PRE_LITIGATION', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'ร่างและยื่นฟ้อง/คำร้องเข้าเป็นโจทก์ร่วม',
        instructions: 'ผู้เสียหายฟ้องเองต้องมีสาระตาม ป.วิ.อ. ม.158 และผ่านการไต่สวนมูลฟ้อง (ม.162); หรือยื่นคำร้องขอเข้าร่วมเป็นโจทก์กับอัยการก่อนศาลชั้นต้นพิพากษา (ม.30)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FILING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
      {
        title: 'ยื่นคำร้องขอค่าสินไหมทดแทน (ผู้เสียหาย)',
        instructions: 'ยื่นคำร้องตาม ป.วิ.อ. ม.44/1 ก่อนเริ่มสืบพยาน (หรือก่อนศาลชั้นต้นวินิจฉัยคดีหากไม่มีการสืบพยาน) พร้อมหลักฐานความเสียหาย',
        primaryRole: 'LAWYER', stage: 'FILING', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'เตรียมคำให้การจำเลยและนัดพร้อม/ตรวจพยานหลักฐาน',
        instructions: 'ปรึกษาแนวทางรับสารภาพหรือปฏิเสธก่อนศาลสอบคำให้การ (ป.วิ.อ. ม.172); ขอตรวจพยานหลักฐานของอีกฝ่าย (ม.173/1–173/2)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'ANSWER', offsetDays: 5, dayBasis: 'BUSINESS',
      },
      {
        title: 'ไกล่เกลี่ย/เจรจายอมความหรือชดใช้ค่าเสียหาย',
        instructions: 'ความผิดอันยอมความได้ ยอมความแล้วสิทธินำคดีมาฟ้องระงับ (ป.วิ.อ. ม.39(2)); ความผิดอาญาแผ่นดิน การชดใช้ใช้ประกอบดุลพินิจการลงโทษ ต้องได้รับอนุมัติวงเงินจากลูกความ',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'LAWYER', stage: 'MEDIATION', offsetDays: 7, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นบัญชีระบุพยาน',
        instructions: 'ยื่นก่อนวันตรวจพยานหลักฐาน หรือก่อนวันสืบพยาน ไม่น้อยกว่า 15 วัน พร้อมสำเนา (ป.วิ.อ. ม.229/1); ตั้งเตือนนับถอยหลังจากวันนัดของศาล',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'HEARING', offsetDays: 2, dayBasis: 'BUSINESS',
      },
      {
        title: 'เตรียมพยานและซักซ้อมการเบิกความ',
        instructions: 'ซักซ้อมพยานบุคคล จัดเรียงเอกสาร/วัตถุพยาน และขอหมายเรียกพยานที่ต้องเรียกโดยศาล',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'HEARING', offsetDays: 10, dayBasis: 'CALENDAR',
      },
      {
        title: 'ฟังคำพิพากษาและขอคัดถ่ายคำพิพากษา',
        instructions: 'เข้าฟังคำพิพากษาพร้อมลูกความ (ติดตามหลักประกันกรณีปล่อยชั่วคราว) ขอคัดสำเนารับรองและรายงานผลพร้อมความเห็นเรื่องอุทธรณ์',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'AWAITING_JUDGMENT', offsetDays: 0, dayBasis: 'BUSINESS',
      },
      {
        title: 'ร่างและยื่นอุทธรณ์',
        instructions: 'ยื่นภายใน 1 เดือนนับแต่วันอ่านคำพิพากษา (ป.วิ.อ. ม.198); ตรวจข้อห้ามอุทธรณ์ข้อเท็จจริงตาม ม.193 ทวิ และยื่นคำร้องขอปล่อยชั่วคราวระหว่างอุทธรณ์หากจำเป็น',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'APPEAL', offsetDays: 21, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นฎีกาพร้อมคำร้องขออนุญาตฎีกา',
        instructions: 'ยื่นภายใน 1 เดือนนับแต่อ่านคำพิพากษาศาลอุทธรณ์ (ป.วิ.อ. ม.216) พร้อมคำร้องขออนุญาตฎีกา (ม.218–221 และระบบอนุญาตให้ฎีกาตามที่แก้ไขล่าสุด — ให้ทนายอาวุโสตรวจเงื่อนไข)',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'LAWYER', stage: 'SUPREME', offsetDays: 21, dayBasis: 'CALENDAR',
      },
      {
        title: 'รายงานผลคดี คืนหลักประกัน และปิดแฟ้ม',
        instructions: 'ติดตามถอนหลักประกัน/คืนเงินประกัน ส่งรายงานสรุปและใบแจ้งหนี้คงค้าง คืนเอกสารต้นฉบับ และอนุมัติปิดแฟ้ม',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'OWNER', stage: 'CLOSING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
    ],
  },

  // ─────────────────────────── คดีครอบครัว/มรดก ───────────────────────────
  {
    key: 'DEFAULT_FAMILY',
    name: 'คดีครอบครัวและมรดก (หย่า/อำนาจปกครอง/ผู้จัดการมรดก)',
    caseTypeNames: ['คดีครอบครัว', 'Family Law'],
    steps: [
      {
        title: 'ตรวจสอบผลประโยชน์ขัดกัน (Conflict check)',
        instructions: 'ค้นชื่อคู่สมรส บุตร ทายาท และผู้เกี่ยวข้องในระบบก่อนรับงาน (ห้ามรับทั้งสองฝ่ายตามมรรยาททนายความ)',
        primaryRole: 'ASSISTANT', secondaryRole: 'OWNER', stage: 'INTAKE_REVIEW', offsetDays: 1, dayBasis: 'BUSINESS',
      },
      {
        title: 'ประเมินเหตุฟ้องหย่า/สิทธิทายาทและอายุความ',
        instructions: 'หย่า: ตรวจเหตุตาม ป.พ.พ. ม.1516 และสิทธิฟ้องระงับตาม ม.1529 (1 ปีนับแต่รู้เหตุบางกรณี); มรดก: อายุความ 1 ปีนับแต่รู้ถึงความตายเจ้ามรดก (ม.1754)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'INTAKE_REVIEW', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ทำสัญญาจ้างและใบแต่งทนายความ',
        instructions: 'ทำสัญญาค่าวิชาชีพ และรับใบแต่งทนายความ/หนังสือยินยอมของทายาท (กรณีขอตั้งผู้จัดการมรดก)',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'ASSISTANT', stage: 'INTAKE_REVIEW', offsetDays: 5, dayBasis: 'BUSINESS',
      },
      {
        title: 'รวบรวมเอกสารทะเบียนครอบครัว/มรดก',
        instructions: 'ทะเบียนสมรส สูติบัตรบุตร ทะเบียนบ้าน; มรดก: มรณบัตร พินัยกรรม บัญชีเครือญาติ และเอกสารสิทธิทรัพย์มรดก (โฉนด สมุดบัญชี ทะเบียนรถ)',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FACT_GATHERING', offsetDays: 7, dayBasis: 'CALENDAR',
      },
      {
        title: 'จัดทำบัญชีสินสมรส/ทรัพย์มรดกเบื้องต้น',
        instructions: 'แยกสินส่วนตัวและสินสมรส (ป.พ.พ. ม.1471–1474) หรือรายการทรัพย์และหนี้กองมรดก เพื่อกำหนดคำขอและค่าขึ้นศาล',
        primaryRole: 'LAWYER', stage: 'FACT_GATHERING', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'เจรจาหย่าโดยความยินยอม/ทำบันทึกข้อตกลง',
        instructions: 'หากตกลงได้ ร่างบันทึกข้อตกลงเรื่องบุตร ค่าอุปการะเลี้ยงดู และทรัพย์สิน แล้วจดทะเบียนหย่าที่สำนักทะเบียน (ป.พ.พ. ม.1514–1515, ม.1520, ม.1522)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'PRE_LITIGATION', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'ร่างคำฟ้อง/คำร้องขอตั้งผู้จัดการมรดก',
        instructions: 'ยื่นต่อศาลเยาวชนและครอบครัว (หย่า/อำนาจปกครอง ม.1566) หรือศาลที่มีเขตอำนาจเหนือภูมิลำเนาเจ้ามรดก (ขอตั้งผู้จัดการมรดก ป.พ.พ. ม.1711–1713)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FILING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
      {
        title: 'ยื่นผ่าน e-Filing ชำระค่าธรรมเนียม และขอส่งหมาย',
        instructions: 'ยื่นและชำระค่าธรรมเนียม; คดีมีข้อพิพาทร้องขอส่งหมายเรียกภายใน 7 วัน (ป.วิ.พ. ม.173); คดีมรดกติดตามศาลประกาศหนังสือพิมพ์/เว็บไซต์ศาลก่อนวันไต่สวน',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FILING', offsetDays: 10, dayBasis: 'BUSINESS',
      },
      {
        title: 'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)',
        instructions: 'ยื่นภายใน 15 วันนับแต่ได้รับหมายเรียก (ป.วิ.พ. ม.177) หรือราว 30 วันกรณีปิดหมาย (ม.79) หรือขอขยายเวลาก่อนครบกำหนด',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'ANSWER', offsetDays: 10, dayBasis: 'CALENDAR',
      },
      {
        title: 'เข้าร่วมกระบวนการประนีประนอมของศาลเยาวชนและครอบครัว',
        instructions: 'เตรียมข้อเสนอเรื่องบุตรโดยคำนึงถึงประโยชน์สูงสุดของผู้เยาว์ ตาม พ.ร.บ.ศาลเยาวชนและครอบครัวฯ พ.ศ. 2553 (หมวดวิธีพิจารณาคดีครอบครัว ม.142 เป็นต้นไป)',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'LAWYER', stage: 'MEDIATION', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ยื่นบัญชีระบุพยานและเตรียมพยานไต่สวน',
        instructions: 'ยื่นก่อนวันสืบพยานไม่น้อยกว่า 7 วัน (ป.วิ.พ. ม.88); คดีมรดกเตรียมหนังสือให้ความยินยอมของทายาทและผู้ร้องมาเบิกความ',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'HEARING', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ฟังคำพิพากษา/คำสั่งและขอคัดสำเนารับรอง',
        instructions: 'ขอคัดคำพิพากษา/คำสั่ง พร้อมหนังสือรับรองคดีถึงที่สุด (เพื่อจดทะเบียนหย่าหรือใช้ติดต่อธนาคาร/กรมที่ดินในฐานะผู้จัดการมรดก)',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'AWAITING_JUDGMENT', offsetDays: 0, dayBasis: 'BUSINESS',
      },
      {
        title: 'แจ้งลูกความทำบัญชีทรัพย์มรดก (ผู้จัดการมรดก)',
        instructions: 'ต้องลงมือทำบัญชีภายใน 15 วัน และทำให้เสร็จภายใน 1 เดือนนับแต่ทราบคำสั่งศาล ต่อหน้าผู้มีส่วนได้เสียอย่างน้อย 2 คน (ป.พ.พ. ม.1728–1729); จัดการและแบ่งปันให้เสร็จภายใน 1 ปี (ม.1732)',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'ENFORCEMENT', offsetDays: 10, dayBasis: 'CALENDAR',
      },
      {
        title: 'ร่างและยื่นอุทธรณ์',
        instructions: 'ยื่นภายใน 1 เดือนนับแต่วันอ่านคำพิพากษา (ป.วิ.พ. ม.229 ใช้บังคับกับคดีครอบครัวเท่าที่ พ.ร.บ.ศาลเยาวชนฯ ไม่ได้บัญญัติไว้เป็นอย่างอื่น)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'APPEAL', offsetDays: 21, dayBasis: 'CALENDAR',
      },
      {
        title: 'รายงานผลคดีและปิดแฟ้ม',
        instructions: 'ส่งรายงานสรุป สำเนาคำพิพากษา/คำสั่ง และใบแจ้งหนี้คงค้าง คืนเอกสารต้นฉบับ และอนุมัติปิดแฟ้ม',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'OWNER', stage: 'CLOSING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
    ],
  },

  // ─────────────────────────── คดีบริษัท (งานนิติกรรม) ───────────────────────────
  {
    key: 'DEFAULT_CORPORATE',
    name: 'งานบริษัท (จดทะเบียน/สัญญา/Due Diligence)',
    caseTypeNames: ['คดีบริษัท', 'Corporate'],
    steps: [
      {
        title: 'ตรวจสอบผลประโยชน์ขัดกันและ KYC ลูกความ',
        instructions: 'ค้นชื่อลูกความ คู่สัญญา ผู้ถือหุ้นและกรรมการในระบบ และขอหนังสือรับรอง/บัตรประชาชนของผู้มีอำนาจ',
        primaryRole: 'ASSISTANT', secondaryRole: 'OWNER', stage: 'INTAKE_REVIEW', offsetDays: 1, dayBasis: 'BUSINESS',
      },
      {
        title: 'กำหนดขอบเขตงานและทำหนังสือว่าจ้าง',
        instructions: 'ระบุขอบเขต (จดทะเบียน/ร่างสัญญา/DD) กำหนดส่งงาน และค่าวิชาชีพเป็นลายลักษณ์อักษร',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'LAWYER', stage: 'INTAKE_REVIEW', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ตรวจและจองชื่อนิติบุคคลกับ DBD',
        instructions: 'จองชื่อผ่านระบบ DBD e-Service; ชื่อที่จองได้มีอายุ 30 วันนับแต่นายทะเบียนอนุญาต ต้องยื่นจดทะเบียนภายในกำหนด',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FACT_GATHERING', offsetDays: 2, dayBasis: 'BUSINESS',
      },
      {
        title: 'รวบรวมข้อมูลผู้ก่อการ ผู้ถือหุ้น กรรมการ และทุน',
        instructions: 'ต้องมีผู้เริ่มก่อการอย่างน้อย 2 คน (ป.พ.พ. ม.1097 แก้ไขล่าสุด) ข้อมูลทุนจดทะเบียน จำนวนหุ้น วัตถุประสงค์ ที่ตั้งสำนักงาน และอำนาจกรรมการ',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'FACT_GATHERING', offsetDays: 7, dayBasis: 'CALENDAR',
      },
      {
        title: 'ขอเอกสารและทำ Due Diligence (กรณีซื้อกิจการ/ลงทุน)',
        instructions: 'ส่ง DD request list ตรวจหนังสือรับรอง บอจ.5 งบการเงิน สัญญาสำคัญ ใบอนุญาต คดีความ และภาระผูกพันทรัพย์สิน',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FACT_GATHERING', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'จัดทำรายงาน Due Diligence',
        instructions: 'สรุปประเด็นความเสี่ยงแยกระดับ (สูง/กลาง/ต่ำ) พร้อมข้อเสนอเงื่อนไขบังคับก่อนและคำรับรองในสัญญา ให้ทนายอาวุโสตรวจก่อนส่ง',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FACT_GATHERING', offsetDays: 21, dayBasis: 'CALENDAR',
      },
      {
        title: 'ร่าง/ตรวจสัญญาและเจรจาแก้ไข',
        instructions: 'ร่างหรือตรวจสัญญา ติดตาม redline กับคู่สัญญา และบันทึกประเด็นที่ลูกความตัดสินใจแล้ว; ตรวจอากรแสตมป์ตามประมวลรัษฎากร',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'PRE_LITIGATION', offsetDays: 7, dayBasis: 'BUSINESS',
      },
      {
        title: 'จัดทำหนังสือบริคณห์สนธิ รายงานประชุมจัดตั้ง และข้อบังคับ',
        instructions: 'ร่างเอกสารจัดตั้งตามแบบ DBD และจัดประชุมจัดตั้งบริษัท (ป.พ.พ. ม.1107–1108); ต้องจดทะเบียนภายใน 3 เดือนนับแต่วันประชุมจัดตั้ง (ม.1111)',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'FILING', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ยื่นจดทะเบียนกับกรมพัฒนาธุรกิจการค้า',
        instructions: 'ยื่นผ่าน DBD Biz Regist (e-Registration) ชำระค่าธรรมเนียม และแก้ไขตามคำสั่งนายทะเบียน; ติดตามจนได้หนังสือรับรองนิติบุคคล',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FILING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
      {
        title: 'จดทะเบียนภาษีมูลค่าเพิ่มและประกันสังคม (ถ้าเข้าเกณฑ์)',
        instructions: 'ภ.พ.01 ภายใน 30 วันนับแต่รายรับเกิน 1.8 ล้านบาท/ปี (ประมวลรัษฎากร ม.85/1); ขึ้นทะเบียนนายจ้างภายใน 30 วันนับแต่มีลูกจ้าง (พ.ร.บ.ประกันสังคม ม.34)',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FILING', offsetDays: 20, dayBasis: 'CALENDAR',
      },
      {
        title: 'จัดทำสมุดทะเบียนผู้ถือหุ้นและใบหุ้น',
        instructions: 'จัดทำทะเบียนผู้ถือหุ้น (ป.พ.พ. ม.1138) และออกใบหุ้นให้ผู้ถือหุ้น (ม.1127–1128) ส่งมอบพร้อมเอกสารจดทะเบียน',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'CLOSING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
      {
        title: 'แจ้งปฏิทินหน้าที่ตามกฎหมายประจำปีให้ลูกความ',
        instructions: 'ประชุมสามัญภายใน 4 เดือนนับแต่สิ้นรอบบัญชี (ป.พ.พ. ม.1171) ยื่นงบการเงินภายใน 1 เดือนนับแต่วันอนุมัติ และ บอจ.5 ภายใน 14 วันนับแต่วันประชุมสามัญ (ม.1139)',
        primaryRole: 'LAWYER', stage: 'CLOSING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
      {
        title: 'ส่งมอบงาน ออกใบแจ้งหนี้ และปิดแฟ้ม',
        instructions: 'ส่งมอบเอกสารต้นฉบับและสำเนาดิจิทัล ออกใบแจ้งหนี้คงค้าง และอนุมัติปิดแฟ้ม',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'OWNER', stage: 'CLOSING', offsetDays: 10, dayBasis: 'BUSINESS',
      },
    ],
  },

  // ─────────────────────────── ทรัพย์สินทางปัญญา ───────────────────────────
  {
    key: 'DEFAULT_IP',
    name: 'เครื่องหมายการค้า (จดทะเบียนและการละเมิด)',
    caseTypeNames: ['ทรัพย์สินทางปัญญา', 'Intellectual Property'],
    steps: [
      {
        title: 'ตรวจสอบผลประโยชน์ขัดกัน (Conflict check)',
        instructions: 'ค้นชื่อลูกความ เจ้าของเครื่องหมายที่อาจขัดแย้ง และผู้ถูกกล่าวหาว่าละเมิดในระบบก่อนรับงาน',
        primaryRole: 'ASSISTANT', secondaryRole: 'OWNER', stage: 'INTAKE_REVIEW', offsetDays: 1, dayBasis: 'BUSINESS',
      },
      {
        title: 'ทำหนังสือว่าจ้างและหนังสือมอบอำนาจตัวแทน',
        instructions: 'ทำสัญญาค่าวิชาชีพ และหนังสือมอบอำนาจให้ตัวแทนยื่นคำขอต่อกรมทรัพย์สินทางปัญญา (ต่างประเทศต้องมีการรับรองตามที่กรมฯ กำหนด)',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'ASSISTANT', stage: 'INTAKE_REVIEW', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'สืบค้นเครื่องหมายการค้าที่เหมือน/คล้าย',
        instructions: 'ค้นฐานข้อมูลกรมทรัพย์สินทางปัญญาตามจำพวกสินค้า/บริการ ประเมินลักษณะบ่งเฉพาะและความเสี่ยงตาม พ.ร.บ.เครื่องหมายการค้าฯ ม.7–8, ม.13',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'FACT_GATHERING', offsetDays: 5, dayBasis: 'BUSINESS',
      },
      {
        title: 'รวบรวมหลักฐานการใช้/การละเมิด',
        instructions: 'เก็บรูปเครื่องหมาย รายการสินค้า/บริการ หลักฐานการใช้; กรณีละเมิดให้ล่อซื้อ ถ่ายภาพ บันทึกหน้าเว็บพร้อมวันเวลา และเก็บใบเสร็จ',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FACT_GATHERING', offsetDays: 10, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นคำขอจดทะเบียนเครื่องหมายการค้า (ก.01)',
        instructions: 'ยื่นผ่านระบบ e-Filing กรมทรัพย์สินทางปัญญา ระบุจำพวกและรายการสินค้า/บริการ ชำระค่าธรรมเนียมคำขอ และบันทึกเลขที่คำขอ',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'FILING', offsetDays: 5, dayBasis: 'BUSINESS',
      },
      {
        title: 'ตอบคำสั่งนายทะเบียน/อุทธรณ์คำสั่งปฏิเสธ',
        instructions: 'ปฏิบัติตามคำสั่งหรืออุทธรณ์ต่อคณะกรรมการเครื่องหมายการค้าภายใน 60 วันนับแต่ได้รับหนังสือแจ้ง (พ.ร.บ.เครื่องหมายการค้าฯ ม.16–18 ตามที่แก้ไข พ.ศ. 2559)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FILING', offsetDays: 45, dayBasis: 'CALENDAR',
      },
      {
        title: 'เฝ้าระวังการคัดค้านหลังประกาศโฆษณา',
        instructions: 'บุคคลอื่นคัดค้านได้ภายใน 60 วันนับแต่วันประกาศโฆษณา (ม.35) ผู้ขอต้องยื่นคำโต้แย้งภายใน 60 วันนับแต่ได้รับสำเนาคำคัดค้าน (ม.36)',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'HEARING', offsetDays: 45, dayBasis: 'CALENDAR',
      },
      {
        title: 'ชำระค่าธรรมเนียมรับจดทะเบียน',
        instructions: 'ชำระภายใน 60 วันนับแต่ได้รับหนังสือแจ้งจากนายทะเบียน มิฉะนั้นถือว่าละทิ้งคำขอ (ม.39); รับหนังสือสำคัญแสดงการจดทะเบียน',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'AWAITING_JUDGMENT', offsetDays: 30, dayBasis: 'CALENDAR',
      },
      {
        title: 'ส่งหนังสือเตือนให้ระงับการละเมิด (Cease & Desist)',
        instructions: 'ส่งหนังสือแจ้งเตือนผู้ละเมิดพร้อมหลักฐานการจดทะเบียน และแจ้ง Notice & Takedown ต่อแพลตฟอร์มออนไลน์ที่เกี่ยวข้อง',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'PRE_LITIGATION', offsetDays: 5, dayBasis: 'BUSINESS',
      },
      {
        title: 'ร้องทุกข์/ขอหมายค้นและยึดสินค้าละเมิด',
        instructions: 'ร้องทุกข์ต่อพนักงานสอบสวน (บก.ปอศ./DSI) ตาม พ.ร.บ.เครื่องหมายการค้าฯ ม.108–110 และประสานขอหมายค้นจากศาลทรัพย์สินทางปัญญาฯ',
        primaryRole: 'LAWYER', secondaryRole: 'ASSISTANT', stage: 'PRE_LITIGATION', offsetDays: 14, dayBasis: 'CALENDAR',
      },
      {
        title: 'ยื่นฟ้องคดีละเมิด/ขอคุ้มครองชั่วคราว',
        instructions: 'ยื่นต่อศาลทรัพย์สินทางปัญญาและการค้าระหว่างประเทศกลาง; หากศาลมีคำสั่งคุ้มครองก่อนฟ้อง (ม.116) ต้องฟ้องภายในกำหนดที่กฎหมาย/ศาลกำหนด (ตรวจสอบ)',
        primaryRole: 'LAWYER', secondaryRole: 'SENIOR_LAWYER', stage: 'FILING', offsetDays: 10, dayBasis: 'BUSINESS',
      },
      {
        title: 'ตั้งเตือนต่ออายุเครื่องหมายการค้า',
        instructions: 'ทะเบียนมีอายุ 10 ปีนับแต่วันยื่นคำขอ ยื่นต่ออายุภายใน 90 วันก่อนสิ้นอายุ (ม.53–54) หรือภายใน 6 เดือนหลังสิ้นอายุโดยเสียค่าธรรมเนียมเพิ่ม',
        primaryRole: 'ASSISTANT', secondaryRole: 'LAWYER', stage: 'CLOSING', offsetDays: 3, dayBasis: 'BUSINESS',
      },
      {
        title: 'ส่งมอบหนังสือสำคัญ รายงานผล และปิดแฟ้ม',
        instructions: 'ส่งมอบหนังสือสำคัญแสดงการจดทะเบียนหรือผลคดี ใบแจ้งหนี้คงค้าง และอนุมัติปิดแฟ้ม',
        primaryRole: 'SENIOR_LAWYER', secondaryRole: 'OWNER', stage: 'CLOSING', offsetDays: 7, dayBasis: 'BUSINESS',
      },
    ],
  },
];
