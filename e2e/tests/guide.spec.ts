import { test, expect, Page } from '../helpers/tenant-test';
import { capture } from '../helpers/annotate';

/**
 * Walks the whole product as an OWNER and produces one annotated screenshot per
 * screen into docs/user-guide/shots + docs/user-guide/slides.json.
 * Every red box/badge you see in the deck is drawn by helpers/annotate.ts.
 */

const SIDEBAR = (href: string) => `aside a[href="${href}"]`;

/** Nav bits that are on every dashboard screen — reused as the first callouts. */
const CHROME = [
  { selector: 'aside nav', label: 'เมนูหลัก ใช้สลับหน้าจอทั้งระบบ', place: 'right' as const },
  { selector: 'input[placeholder*="ค้นหาคดี"]', label: 'ช่องค้นหาด่วน คดี/ลูกค้า', place: 'bottom' as const },
];

async function goto(page: Page, route: string) {
  await page.goto(route);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);
}

async function expectDashboardLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.getByText('คดีที่ยังไม่ปิด').first()).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    )
    .toBe(true);
}

let caseId = '';

test('02 — แดชบอร์ด', async ({ page }) => {
  await goto(page, '/dashboard');
  await expectDashboardLoaded(page);

  caseId =
    (await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a[href^="/cases/"]'))
        .map((x) => x.getAttribute('href')!)
        .find((h) => /^\/cases\/[0-9a-f-]{20,}$/i.test(h));
      return a ? a.split('/')[2] : '';
    })) || '';

  await capture(page, {
    id: '02-dashboard',
    title: 'แดชบอร์ด — ภาพรวมงาน',
    route: '/dashboard',
    description:
      'หน้าแรกหลังเข้าสู่ระบบ สรุปคดีที่ยังไม่ปิด งานที่ยังไม่เสร็จ งานเกินกำหนด และนัดที่กำลังจะมาถึง พร้อมรายการงานที่ต้องทำ/เรื่องรับเข้าล่าสุด คดีล่าสุด และนัดหมายถัดไป',
    callouts: [
      ...CHROME,
      { selector: 'main h1, main [class*="heading"], h1', label: 'ชื่อหน้าและสำนักงานที่ใช้งาน', place: 'right' },
      { selector: 'a[href="/cases"]:has-text("คดีที่ยังไม่ปิด")', label: 'จำนวนคดีที่ยังไม่ปิด', place: 'bottom' },
      { selector: 'a[href="/work"]:has-text("งานที่ยังไม่เสร็จ")', label: 'จำนวนงานที่ยังไม่เสร็จ', place: 'bottom' },
      { selector: 'a:has-text("งานเกินกำหนด")', label: 'งานที่เลยกำหนดส่งแล้ว', place: 'bottom' },
      { selector: 'a[href="/calendar"]:has-text("นัดที่กำลังจะมาถึง")', label: 'นัดที่กำลังจะถึง', place: 'bottom' },
      { selector: 'a[href="/intake/new"]', label: 'ปุ่มลัด รับงานใหม่', place: 'left' },
      { selector: 'a[href="/cases"]:has-text("ดูทั้งหมด")', label: 'ไปหน้ารายการคดีทั้งหมด', place: 'left' },
    ],
  });
});

test('02.2 — แดชบอร์ด mobile ไม่มีหน้าล้น', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, '/dashboard');
  await expectDashboardLoaded(page);
  await expectNoHorizontalOverflow(page);
});

test('03 — รายการคดี', async ({ page }) => {
  await goto(page, '/cases');
  await capture(page, {
    id: '03-cases-list',
    title: 'คดี — รายการคดีทั้งหมด',
    route: '/cases',
    description:
      'ตารางคดีทั้งหมดของสำนักงาน ค้นหาด้วย Own Ref / Customer Ref / หมายเลขคดีดำ / หมายเลขคดีแดง / ชื่อลูกค้า กรองตามสถานะ และส่งออกเป็นไฟล์ได้',
    callouts: [
      { selector: 'input[placeholder*="Own Ref"]', label: 'ค้นหาคดีจากเลขอ้างอิงหรือชื่อลูกค้า', place: 'bottom' },
      { selector: 'main select', label: 'กรองตามสถานะคดี', place: 'bottom' },
      { selector: 'button:has-text("Export")', label: 'ส่งออกรายการคดี', place: 'bottom' },
      { selector: 'table', label: 'ตารางคดี คลิกแถวเพื่อเปิดรายละเอียด', place: 'top' },
      { selector: 'a[href="/cases/new"], button:has-text("สร้างคดีใหม่")', label: 'สร้างคดีใหม่', place: 'left' },
    ],
  });
});

test('04 — บอร์ดสถานะคดี', async ({ page }) => {
  await goto(page, '/cases/board');
  await capture(page, {
    id: '04-cases-board',
    title: 'Case Workflow Board — บอร์ดติดตามสถานะ',
    route: '/cases/board',
    description:
      'มุมมองแบบคัมบัง แบ่งคดีตามสถานะ เปิดคดี → ร่างเอกสาร → นัดศาล → ปิดคดี ลากการ์ดเพื่อเปลี่ยนสถานะได้ทันที',
    callouts: [
      { selector: 'main select', label: 'ตัวกรองมุมมองบอร์ด', place: 'bottom' },
      { selector: 'h3', label: 'คอลัมน์สถานะ พร้อมจำนวนคดี', place: 'bottom' },
      { selector: 'a[href^="/cases/"]', label: 'การ์ดคดี ลากเพื่อเปลี่ยนสถานะ / คลิกเพื่อเปิด', place: 'right' },
    ],
  });
});

test('05 — สร้างคดีใหม่ ขั้นที่ 1 เลือกประเภทคดี', async ({ page }) => {
  await goto(page, '/cases/new');
  await capture(page, {
    id: '05-case-new-step1',
    title: 'สร้างคดีใหม่ — ขั้นที่ 1 เลือกประเภทคดี',
    route: '/cases/new',
    description:
      'การสร้างคดีเป็นแบบ 4 ขั้นตอน ขั้นแรกเลือกประเภทคดี ระบบจะปรับฟิลด์ในขั้นถัดไปตามประเภทที่เลือก',
    callouts: [
      { selector: 'h1', label: 'หัวข้อหน้า สร้างคดีใหม่', place: 'right' },
      { selector: 'main button:has-text("Litigation")', label: 'คลิกเลือกประเภทคดี', place: 'right' },
      { selector: 'button:has-text("ถัดไป"), button:has-text("Next")', label: 'กดถัดไปเพื่อไปขั้นถัดไป (ต้องเลือกประเภทก่อน)', place: 'top' },
    ],
  });
});

test('06 — สร้างคดีใหม่ ขั้นที่ 2 ข้อมูลคดี', async ({ page }) => {
  await goto(page, '/cases/new');
  await page.click('main button:has-text("Litigation")');
  await page.click('button:has-text("ถัดไป"), button:has-text("Next")');
  await page.waitForTimeout(500);
  await capture(page, {
    id: '06-case-new-step2',
    title: 'สร้างคดีใหม่ — ขั้นที่ 2 ข้อมูลพื้นฐาน',
    route: '/cases/new',
    description:
      'กรอกข้อมูลคดี Own Ref ถูกสร้างอัตโนมัติ (TSBREF + ปี + เลขรัน) ส่วนหมายเลขคดีดำ/หมายเลขคดีแดงกรอกในรูปแบบ เลขที่/ปีพ.ศ. เช่น 123/2567 และระบุลูกค้ากับรายได้โดยประมาณ',
    callouts: [
      { selector: 'input[placeholder*="เลขอ้างอิงจากลูกค้า"]', label: 'Customer Ref เลขอ้างอิงฝั่งลูกค้า (ไม่บังคับ)', place: 'right' },
      { selector: 'input[placeholder="เช่น 123/2567"]', label: 'หมายเลขคดีดำ รูปแบบ 123/2567', place: 'right' },
      { selector: 'input[placeholder="เช่น 456/2567"]', label: 'หมายเลขคดีแดง รูปแบบ 456/2567', place: 'right' },
      { selector: 'input[type="number"]', label: 'รายได้โดยประมาณ ต้องเป็นตัวเลขไม่ติดลบ', place: 'right' },
      { selector: 'button:has-text("ถัดไป"), button:has-text("Next")', label: 'ไปขั้นตอนถัดไป', place: 'top' },
    ],
  });
});

test('07 — รายละเอียดคดี', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}`);
  await capture(page, {
    id: '07-case-detail',
    title: 'รายละเอียดคดี',
    route: '/cases/:id',
    description:
      'หน้ารวมข้อมูลคดีหนึ่งเรื่อง สถานะ ทนายผู้รับผิดชอบ ผู้ช่วย ศาล เลขคดี และรายได้โดยประมาณ พร้อมแท็บย่อย งาน / เอกสาร / ปฏิทิน / การเงิน',
    callouts: [
      { selector: 'h1', label: 'ชื่อคดีและเลขอ้างอิง', place: 'right' },
      { selector: `a[href$="/tasks"]`, label: 'แท็บงานในคดี', place: 'bottom' },
      { selector: `a[href$="/documents"]`, label: 'แท็บเอกสารของคดี', place: 'bottom' },
      { selector: `a[href$="/billing"]`, label: 'แท็บการเงิน/ค่าใช้จ่ายของคดี', place: 'bottom' },
    ],
  });
});

test('08 — งานในคดี', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}/tasks`);
  await capture(page, {
    id: '08-case-tasks',
    title: 'งานในคดี (Tasks)',
    route: '/cases/:id/tasks',
    description: 'สร้างและติดตามงานย่อยของคดี กำหนดผู้รับผิดชอบและวันครบกำหนด งานที่เลยกำหนดจะแสดงบนแดชบอร์ด',
    callouts: [
      { selector: 'h1', label: 'หน้างานของคดีนี้', place: 'right' },
      { selector: 'main input', label: 'เพิ่มงานใหม่', place: 'right' },
      { selector: 'main button', label: 'ปุ่มจัดการงาน', place: 'left' },
    ],
  });
});

test('09 — เอกสารของคดี', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}/documents`);
  await capture(page, {
    id: '09-case-documents',
    title: 'เอกสารของคดี',
    route: '/cases/:id/documents',
    description:
      'อัปโหลดและจัดเวอร์ชันเอกสารรายคดี ตั้งค่าการมองเห็นเพื่อเปิด/ปิดให้ลูกค้าเห็นผ่าน Client Portal และดาวน์โหลดได้',
    callouts: [
      { selector: 'h1', label: 'เอกสารของคดีนี้', place: 'right' },
      { selector: 'input[type="file"], main button', label: 'อัปโหลดเอกสารใหม่', place: 'right' },
    ],
  });
});

test('10 — การเงินรายคดี', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}/billing`);
  await capture(page, {
    id: '10-case-billing',
    title: 'การเงินรายคดี — เวลาทำงาน ค่าใช้จ่าย ใบแจ้งหนี้',
    route: '/cases/:id/billing',
    description:
      'บันทึกชั่วโมงทำงาน ค่าใช้จ่ายที่ขอเบิก และออกใบแจ้งหนี้ของคดีนี้ ยอดเงินต้องมากกว่า 0 เสมอ',
    callouts: [
      { selector: 'h1', label: 'สรุปการเงินของคดี', place: 'right' },
      { selector: 'button:has-text("Submit Expense")', label: 'เพิ่มรายการเบิกค่าใช้จ่าย', place: 'left' },
    ],
  });
});

test('11 — ลูกค้า', async ({ page }) => {
  await goto(page, '/clients');
  await capture(page, {
    id: '11-clients',
    title: 'ลูกค้า — ทะเบียนลูกค้าและผู้ติดต่อ',
    route: '/clients',
    description: 'รายชื่อลูกค้าทั้งหมด ค้นหาได้จากชื่อ และเปิดดูผู้ติดต่อ คดีที่เกี่ยวข้อง และสิทธิ์เข้าใช้ Client Portal',
    callouts: [
      ...CHROME,
      { selector: 'input[placeholder*="ค้นหาลูกค้า"]', label: 'ค้นหาลูกค้า', place: 'bottom' },
      { selector: 'button:has-text("เพิ่มลูกค้า")', label: 'เพิ่มลูกค้าใหม่', place: 'left' },
    ],
  });
});

test('12 — เพิ่มลูกค้า', async ({ page }) => {
  await goto(page, '/clients/new');
  await capture(page, {
    id: '12-clients-new',
    title: 'เพิ่มลูกค้า — พร้อมผู้ติดต่อหลายคน',
    route: '/clients/new',
    description:
      'สร้างลูกค้าใหม่ เลือกประเภทบุคคล/นิติบุคคล และเพิ่มผู้ติดต่อได้หลายคน เบอร์โทรต้องเป็นตัวเลข และต้องเลือกผู้ติดต่อหลัก 1 คน',
    callouts: [
      { selector: 'input[placeholder*="บริษัท ABC"]', label: 'ชื่อลูกค้า (บังคับ)', place: 'right' },
      { selector: 'main select', label: 'ประเภท บุคคล หรือ นิติบุคคล', place: 'right' },
      { selector: 'input[placeholder*="ชื่อผู้ติดต่อ"]', label: 'ชื่อผู้ติดต่อ (บังคับ)', place: 'right' },
      { selector: 'input[placeholder*="Phone"]', label: 'เบอร์โทร ตัวเลข 9-10 หลัก', place: 'right' },
      { selector: 'button:has-text("Add Contact")', label: 'เพิ่มผู้ติดต่อคนถัดไป', place: 'left' },
      { selector: 'button:has-text("Create Client")', label: 'บันทึกลูกค้า', place: 'right' },
    ],
  });
});

test('13 — ตารางศาล', async ({ page }) => {
  await goto(page, '/court-schedule');
  await capture(page, {
    id: '13-court-schedule',
    title: 'ตารางศาล — ปฏิทินนัดหมาย',
    route: '/court-schedule',
    description: 'ปฏิทินนัดศาลและนัดหมายลูกค้า สลับมุมมอง วัน / สัปดาห์ / เดือน และเพิ่มนัดใหม่ได้จากปุ่ม Add Event',
    callouts: [
      { selector: 'button:has-text("Add Event")', label: 'เพิ่มนัดหมายใหม่', place: 'left' },
      { selector: 'button:has-text("Month")', label: 'สลับมุมมอง วัน/สัปดาห์/เดือน', place: 'bottom' },
      { selector: 'button:has-text("Today")', label: 'กลับไปวันนี้', place: 'bottom' },
      { selector: 'h3', label: 'สรุปนัดในเดือนนี้และการแจ้งเตือน', place: 'left' },
    ],
  });
});

test('14 — เอกสารรวม', async ({ page }) => {
  await goto(page, '/documents');
  await capture(page, {
    id: '14-documents',
    title: 'เอกสาร — คลังเอกสารรวมทุกคดี',
    route: '/documents',
    description: 'ค้นหาเอกสารข้ามคดี กรองตามคดี อัปโหลดเอกสารใหม่ และลิงก์ไปยัง Knowledge Base',
    callouts: [
      { selector: 'input[placeholder*="Search documents"]', label: 'ค้นหาเอกสาร', place: 'bottom' },
      { selector: 'main select', label: 'กรองตามคดี', place: 'bottom' },
      { selector: 'button:has-text("Upload Document")', label: 'อัปโหลดเอกสาร', place: 'left' },
      { selector: 'a[href="/knowledge"]', label: 'ไปยังคลังความรู้', place: 'left' },
    ],
  });
});

test('15 — ค่าใช้จ่ายและการเงิน', async ({ page }) => {
  await goto(page, '/expenses');
  await page
    .click('button:has-text("ค่าใช้จ่ายใหม่"), button:has-text("เพิ่มรายการ"), button:has-text("New Expense")', { timeout: 3_000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  await capture(page, {
    id: '15-expenses',
    title: 'ค่าใช้จ่าย & การเงิน',
    route: '/expenses',
    description:
      'ดูกำไรรายคดี บันทึกค่าใช้จ่ายเพื่อขออนุมัติ และติดตามใบแจ้งหนี้ ยอดเงินต้องมากกว่า 0 และไม่เกิน 100,000,000 บาท',
    callouts: [
      { selector: 'input[type="number"]', label: 'ยอดเงิน (บาท) ต้องมากกว่า 0', place: 'right' },
      { selector: 'input[placeholder="Description"]', label: 'รายละเอียดค่าใช้จ่าย (บังคับ)', place: 'right' },
      { selector: 'form select', label: 'เลือกหมวดและคดีที่เกี่ยวข้อง', place: 'right' },
      { selector: 'button:has-text("Submit for Approval")', label: 'ส่งขออนุมัติ', place: 'right' },
      { selector: 'table', label: 'ตารางกำไรรายคดี / รายการเบิก / ใบแจ้งหนี้', place: 'top' },
    ],
  });
});

test('16 — รายงาน', async ({ page }) => {
  await goto(page, '/reports');
  await capture(page, {
    id: '16-reports',
    title: 'รายงาน',
    route: '/reports',
    description: 'รายงานเชิงบริหาร ปริมาณคดีตามประเภท รายได้ต่อทนาย บันทึกการขึ้นศาล และสรุปค่าใช้จ่าย ส่งออกได้ทั้งหมด',
    callouts: [
      { selector: 'button:has-text("Export All")', label: 'ส่งออกรายงานทั้งหมด', place: 'left' },
      { selector: 'h3', label: 'การ์ดรายงานแต่ละหัวข้อ', place: 'bottom' },
    ],
  });
});

test('17 — คลังความรู้', async ({ page }) => {
  await goto(page, '/knowledge');
  await capture(page, {
    id: '17-knowledge',
    title: 'Knowledge Base — คลังสรุปคดี',
    route: '/knowledge',
    description: 'รวมบทสรุปคดีที่ผ่านมา ค้นหาและกรองตามประเภท/ผลคดี เพื่อใช้อ้างอิงกับคดีใหม่',
    callouts: [
      { selector: 'input[placeholder*="Search summaries"]', label: 'ค้นหาสรุปคดี', place: 'bottom' },
      { selector: 'main select', label: 'กรองตามประเภทคดีและผลคดี', place: 'bottom' },
    ],
  });
});

test('18 — จัดการทีม', async ({ page }) => {
  await goto(page, '/team');
  await capture(page, {
    id: '18-team',
    title: 'จัดการทีม — เชิญและกำหนดสิทธิ์',
    route: '/team',
    description: 'เชิญสมาชิกใหม่ด้วยอีเมล กำหนดบทบาท (OWNER / LAWYER / CLERK) ดูสมาชิกปัจจุบันและคำเชิญที่รอตอบรับ',
    callouts: [
      { selector: 'input[type="email"]', label: 'อีเมลผู้ที่ต้องการเชิญ', place: 'right' },
      { selector: 'main select', label: 'เลือกบทบาท/สิทธิ์', place: 'right' },
      { selector: 'button:has-text("ส่งคำเชิญ")', label: 'ส่งคำเชิญทางอีเมล', place: 'right' },
      { selector: 'table', label: 'สมาชิกในทีมปัจจุบัน', place: 'top' },
    ],
  });
});

test('19 — แพ็กเกจและการชำระเงิน', async ({ page }) => {
  await goto(page, '/account/billing');
  await capture(page, {
    id: '19-account-billing',
    title: 'แพ็กเกจ & การชำระเงิน',
    route: '/account/billing',
    description: 'ดูสถานะทดลองใช้/แพ็กเกจปัจจุบัน จำนวนผู้ใช้ที่ใช้ไป และเลือกสมัครแพ็กเกจ Solo / Firm / Professional',
    callouts: [
      { selector: 'h3', label: 'สถานะแพ็กเกจปัจจุบันและจำนวนผู้ใช้', place: 'bottom' },
      { selector: 'button:has-text("สมัคร / ชำระเงิน")', label: 'เลือกแพ็กเกจแล้วชำระเงิน', place: 'right' },
    ],
  });
});

test('20 — อนุมัติการเบิกจ่าย', async ({ page }) => {
  await goto(page, '/admin/reimbursements');
  await capture(page, {
    id: '20-reimbursements',
    title: 'เบิกจ่าย — อนุมัติค่าใช้จ่าย (เฉพาะเจ้าของสำนักงาน)',
    route: '/admin/reimbursements',
    description: 'คิวอนุมัติค่าใช้จ่ายที่ทีมส่งเข้ามา กรองตามสถานะ แล้วกด Approve / Reject / Mark Paid',
    callouts: [
      { selector: 'button:has-text("PENDING")', label: 'กรองตามสถานะรายการ', place: 'bottom' },
      { selector: 'button:has-text("Approve")', label: 'อนุมัติรายการ', place: 'left' },
      { selector: 'button:has-text("Reject")', label: 'ปฏิเสธรายการ', place: 'left' },
      { selector: 'button:has-text("Mark Paid")', label: 'ทำเครื่องหมายว่าจ่ายแล้ว', place: 'left' },
    ],
  });
});

test('21 — ประเภทคดี', async ({ page }) => {
  await goto(page, '/admin/case-types');
  await capture(page, {
    id: '21-case-types',
    title: 'ประเภทคดี — ตั้งค่าฟิลด์ของแต่ละประเภท',
    route: '/admin/case-types',
    description: 'กำหนดประเภทคดีของสำนักงานและฟิลด์เฉพาะที่จะให้กรอกในขั้นตอนสร้างคดี',
    callouts: [
      { selector: 'button:has-text("Add Type")', label: 'เพิ่มประเภทคดีใหม่', place: 'left' },
      { selector: 'h3', label: 'ประเภทคดีที่มีอยู่', place: 'right' },
    ],
  });
});

test('22 — ศาล', async ({ page }) => {
  await goto(page, '/admin/courts');
  await capture(page, {
    id: '22-courts',
    title: 'ศาล — ทะเบียนศาลของสำนักงาน',
    route: '/admin/courts',
    description: 'จัดการรายชื่อศาลที่ใช้เลือกตอนสร้างคดีและตั้งนัด เพิ่ม แก้ไข หรือลบได้',
    callouts: [
      { selector: 'button:has-text("Add Court")', label: 'เพิ่มศาลใหม่', place: 'left' },
      { selector: 'h1', label: 'ทะเบียนศาล', place: 'right' },
    ],
  });
});

test('23 — ตั้งค่า', async ({ page }) => {
  await goto(page, '/settings');
  await capture(page, {
    id: '23-settings',
    title: 'ตั้งค่า — โปรไฟล์ ธีม และการเชื่อมต่อ',
    route: '/settings',
    description:
      'แก้ไขชื่อผู้ใช้ สลับโหมดสว่าง/มืด และในหัวข้อ "การเชื่อมต่อ" ด้านล่างมีทั้งการตั้งค่า LINE Messaging API ของทั้งสำนักงาน (เฉพาะแอดมิน) และปุ่มเชื่อมต่อ LINE ส่วนตัวของแต่ละคน',
    callouts: [
      { selector: 'main input', label: 'ข้อมูลโปรไฟล์ (อีเมลแก้ไขไม่ได้)', place: 'right' },
      { selector: 'button:has-text("Save Changes")', label: 'บันทึกการเปลี่ยนแปลง', place: 'right' },
      { selector: 'button:has-text("Switch to Dark")', label: 'สลับธีมสว่าง/มืด', place: 'right' },
      { selector: ':text("LINE Messaging API")', label: 'ตั้งค่า LINE ของสำนักงาน (แอดมิน) — Channel ID/Secret', place: 'right' },
      { selector: 'button:has-text("ส่งข้อความทดสอบ")', label: 'ทดสอบว่าตั้งค่า LINE ของสำนักงานถูกต้อง', place: 'left' },
      { selector: ':text("เชื่อมต่อ LINE ส่วนตัว")', label: 'ส่วนเชื่อมต่อบัญชี LINE ของตัวเอง', place: 'right' },
      { selector: 'button:has-text("เชื่อมต่อ LINE"), button:has-text("ยกเลิกการเชื่อมต่อ")', label: 'กดเพื่อเชื่อมต่อ/ยกเลิกเชื่อมต่อ LINE ส่วนตัว', place: 'right' },
    ],
  });
});

test('24 — Client Portal', async ({ page, context }) => {
  await context.clearCookies();
  await goto(page, '/portal/login');
  await capture(page, {
    id: '24-portal-login',
    title: 'Client Portal — หน้าเข้าสู่ระบบของลูกค้า',
    route: '/portal/login',
    description:
      'ลูกค้าเข้าใช้งานได้สองแบบ: กรอกอีเมล+รหัสผ่านแล้วกดเข้าสู่ระบบตามปกติ หรือกด "ส่งลิงก์เข้าสู่ระบบทางอีเมล" เพื่อรับ magic link ทางอีเมลโดยไม่ต้องจำรหัสผ่าน',
    callouts: [
      { selector: 'input[type="email"]', label: 'อีเมลของลูกค้า', place: 'right' },
      { selector: 'input[type="password"]', label: 'รหัสผ่าน (ถ้าตั้งไว้แล้ว)', place: 'right' },
      { selector: 'button[type="submit"]', label: 'เข้าสู่ระบบด้วยรหัสผ่าน', place: 'right' },
      { selector: 'button:has-text("ส่งลิงก์เข้าสู่ระบบทางอีเมล")', label: 'หรือขอ magic link ทางอีเมลแทน', place: 'right' },
    ],
  });
});

test('24.1 — Client Portal ส่งอีเมลแล้ว', async ({ page, context }) => {
  await context.clearCookies();
  await goto(page, '/portal/login');
  await page.fill('input[type="email"]', 'client-demo@example.test');
  await page.click('button:has-text("ส่งลิงก์เข้าสู่ระบบทางอีเมล")').catch(() => {});
  await page.waitForTimeout(500);
  const moved = /\/portal\/check-email/.test(page.url());
  test.skip(!moved, 'magic-link request did not navigate to check-email');
  await capture(page, {
    id: '24.1-portal-check-email',
    title: 'Client Portal — ตรวจสอบอีเมล',
    route: '/portal/check-email',
    description: 'หลังขอ magic link ระบบพาไปหน้านี้ให้ลูกค้าไปเปิดอีเมลและกดลิงก์ที่ส่งไปเพื่อเข้าสู่ระบบ',
    callouts: [{ selector: 'main', label: 'ข้อความแจ้งให้ไปเปิดอีเมล', place: 'right' }],
  });
});

// ---------------------------------------------------------------------------
// หน้าเพิ่มเติม: งานประจำวัน / งานรับเข้า / ทีมและเอกสารภายใน / แอดมิน / หน้าสาธารณะ
// ---------------------------------------------------------------------------

test('25 — เริ่มใช้งานสำนักงาน', async ({ page }) => {
  await goto(page, '/getting-started');
  await capture(page, {
    id: '25-getting-started',
    title: 'เริ่มใช้งานสำนักงาน — นำเข้าข้อมูลเดิม',
    route: '/getting-started',
    description:
      'ใช้ตอนเริ่มระบบครั้งแรก ดาวน์โหลดแบบฟอร์ม CSV กรอกรายชื่อคดี/ลูกค้าเดิม แล้วอัปโหลดกลับเข้าระบบ ระบบจะแสดงตัวอย่างก่อนนำเข้าจริงเสมอ',
    callouts: [
      { selector: 'button:has-text("Download CSV")', label: 'ดาวน์โหลดแบบฟอร์ม CSV', place: 'right' },
      { selector: 'input[type="file"]', label: 'เลือกไฟล์ CSV ที่กรอกแล้ว', place: 'right' },
      { selector: 'button:has-text("Preview")', label: 'ดูตัวอย่างก่อนนำเข้าจริง', place: 'right' },
      { selector: 'a[href="/playbooks"]', label: 'ไปตั้งค่า Playbook ของสำนักงาน', place: 'left' },
    ],
  });
});

test('26 — วันของฉัน (My Day)', async ({ page }) => {
  await goto(page, '/my-day');
  await capture(page, {
    id: '26-my-day',
    title: 'วันของฉัน — สรุปงานและนัดวันนี้',
    route: '/my-day',
    description:
      'มุมมองแบบรายวันสำหรับเตรียมตัวก่อนเริ่มงาน รวมนัดศาล นัดลูกค้า และงานที่ครบกำหนดวันนี้ไว้ในที่เดียว กดที่รายการเพื่อเปิดรายละเอียด',
    callouts: [
      { selector: 'button:has-text("เพิ่มนัด"), button:has-text("Add event")', label: 'เพิ่มนัดหมายใหม่', place: 'left' },
      { selector: 'h1', label: 'หัวข้อหน้า วันของฉัน', place: 'right' },
    ],
  });
});

test('27 — งานที่ต้องทำ (Work Inbox)', async ({ page }) => {
  await goto(page, '/work');
  await capture(page, {
    id: '27-work',
    title: 'งานที่ต้องทำ — กล่องงานรวมทั้งงานคดีและงานส่วนตัว',
    route: '/work',
    description:
      'รวมงานทั้งหมดที่มอบหมายให้คุณ ทั้งงานในคดีและงานทั่วไป กรองตาม ทั้งหมด/มอบหมายให้ฉัน/งานคดี/งานทั่วไป และตามกำหนดส่ง ค้นหาได้จากชื่องาน คดี หรือผู้รับผิดชอบ',
    callouts: [
      { selector: 'input[placeholder*="ค้นชื่องาน"]', label: 'ค้นหางาน คดี หรือผู้รับผิดชอบ', place: 'bottom' },
      { selector: 'button:has-text("มอบหมายให้ฉัน")', label: 'กรองเฉพาะงานของฉัน', place: 'bottom' },
      { selector: 'button:has-text("เกินกำหนด")', label: 'กรองงานที่เลยกำหนดส่ง', place: 'bottom' },
      { selector: 'a[href="/todos?new=1"]', label: 'เพิ่มงานส่วนตัวใหม่', place: 'left' },
    ],
  });
});

test('28 — งานส่วนตัว (Todos)', async ({ page }) => {
  await goto(page, '/todos');
  await capture(page, {
    id: '28-todos',
    title: 'งานส่วนตัว — เช็คลิสต์ของแต่ละคน',
    route: '/todos',
    description: 'จดงานส่วนตัวที่ไม่ผูกกับคดี เช่น งานธุรการหรืองานที่ได้รับมอบหมายนอกคดี สลับดูงานของตัวเอง/ทีม',
    callouts: [
      { selector: 'input[placeholder*="Todo title"], input[placeholder*="หัวข้องาน"]', label: 'พิมพ์ชื่องานแล้วกด Enter เพื่อเพิ่ม', place: 'right' },
      { selector: 'button:has-text("Add Todo"), button:has-text("เพิ่ม")', label: 'เพิ่มงานใหม่', place: 'right' },
    ],
  });
});

test('29 — ปฏิทินสำนักงาน', async ({ page }) => {
  await goto(page, '/calendar');
  await capture(page, {
    id: '29-calendar',
    title: 'ปฏิทิน — ตารางรายวันของสำนักงาน',
    route: '/calendar',
    description: 'ปฏิทินรวมนัดทั้งสำนักงาน ทุกคดีและทุกทนาย สลับมุมมองวัน/สัปดาห์/เดือนได้เหมือนตารางศาล',
    callouts: [
      { selector: 'button:has-text("เพิ่มนัด"), button:has-text("Add event")', label: 'เพิ่มนัดหมายใหม่', place: 'left' },
      { selector: 'h1', label: 'หัวข้อหน้า ปฏิทิน', place: 'right' },
    ],
  });
});

test('30 — ใบแจ้งหนี้', async ({ page }) => {
  await goto(page, '/invoices');
  await capture(page, {
    id: '30-invoices',
    title: 'ใบแจ้งหนี้ — ออกและติดตามการชำระเงิน',
    route: '/invoices',
    description: 'รวมใบแจ้งหนี้ทุกคดี ดูสถานะค้างชำระ/ชำระแล้ว และออกใบแจ้งหนี้ใหม่จากชั่วโมงทำงานและค่าใช้จ่ายที่บันทึกไว้',
    callouts: [
      { selector: 'h1', label: 'หัวข้อหน้า ใบแจ้งหนี้', place: 'right' },
      { selector: 'table', label: 'รายการใบแจ้งหนี้', place: 'top' },
      { selector: 'button:has-text("New Invoice"), button:has-text("สร้างใบแจ้งหนี้")', label: 'ออกใบแจ้งหนี้ใหม่', place: 'left' },
    ],
  });
});

test('31 — ปฏิทินของคดี (แท็บย่อย)', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}/calendar`);
  await capture(page, {
    id: '31-case-calendar',
    title: 'คดี — แท็บปฏิทิน/นัดของคดีนี้',
    route: '/cases/:id/calendar',
    description: 'ลิงก์ลัดจากแดชบอร์ด/My Day พาไปที่แท็บปฏิทินของคดีนั้นโดยตรง แสดงนัดศาลและนัดหมายเฉพาะคดีนี้',
    callouts: [{ selector: 'h1', label: 'ชื่อคดีที่กำลังดู', place: 'right' }],
  });
});

test('32 — ประกันของคดี (แท็บย่อย)', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}/insurance`);
  await capture(page, {
    id: '32-case-insurance',
    title: 'คดี — แท็บเคลมประกัน',
    route: '/cases/:id/insurance',
    description: 'สำหรับคดีที่เกี่ยวข้องกับการเคลมประกัน ติดตามขั้นตอนการเคลมและเอกสารที่เกี่ยวข้องแยกจากแท็บอื่น',
    callouts: [{ selector: 'h1', label: 'ชื่อคดีที่กำลังดู', place: 'right' }],
  });
});

test('33 — ข้อความในคดี (แท็บย่อย)', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}/messages`);
  await capture(page, {
    id: '33-case-messages',
    title: 'คดี — แท็บข้อความกับลูกค้า',
    route: '/cases/:id/messages',
    description: 'พูดคุยกับลูกค้าเป็นรายคดี ข้อความที่ส่งจากแท็บนี้จะไปปรากฏใน Client Portal ของลูกค้าด้วย',
    callouts: [{ selector: 'h1', label: 'ชื่อคดีที่กำลังดู', place: 'right' }],
  });
});

test('34 — รายงานปิดคดี (แท็บย่อย)', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, `/cases/${caseId}/closing-report`);
  await capture(page, {
    id: '34-case-closing-report',
    title: 'คดี — แท็บสรุปปิดคดี',
    route: '/cases/:id/closing-report',
    description: 'สรุปผลคดีเมื่อปิดคดีแล้ว ใช้ประกอบการส่งอีเมลปิดงานให้ลูกค้าและเก็บเป็นสรุปคดีใน Knowledge Base',
    callouts: [{ selector: 'h1', label: 'ชื่อคดีที่กำลังดู', place: 'right' }],
  });
});

test('35 — รับเรื่อง (Intake)', async ({ page }) => {
  await goto(page, '/intake');
  await capture(page, {
    id: '35-intake',
    title: 'รับเรื่อง — คิวเรื่องที่กำลังคัดกรอง',
    route: '/intake',
    description:
      'จุดเริ่มต้นก่อนเปิดเป็นคดีจริง ใช้คัดกรองเรื่องที่ลูกค้าติดต่อเข้ามา (โทร/อีเมล/เดินเข้ามา) ก่อนตัดสินใจรับเป็นคดี',
    callouts: [{ selector: 'button:has-text("สร้างใหม่"), a[href="/intake/new"]', label: 'สร้างเรื่องรับเข้าใหม่', place: 'left' }],
  });
});

test('36 — รับเรื่องใหม่', async ({ page }) => {
  await goto(page, '/intake/new');
  await capture(page, {
    id: '36-intake-new',
    title: 'รับเรื่องใหม่ — กรอกรายละเอียดเบื้องต้น',
    route: '/intake/new',
    description:
      'กรอกหัวข้อเรื่อง วางข้อความจากอีเมล/แชทของลูกค้า ใส่ชื่อผู้ติดต่อ และเลือกผู้รับผิดชอบได้หลายคน ระบบช่วยสรุปข้อเท็จจริงเบื้องต้นให้',
    callouts: [
      { selector: 'input[placeholder*="เลขเคลม"], input[placeholder*="ต่อสู้คดี"]', label: 'หัวข้อเรื่องโดยย่อ', place: 'right' },
      { selector: 'textarea', label: 'วางข้อความจากอีเมล/แชทของลูกค้า', place: 'right' },
      { selector: 'input[placeholder*="ชื่อ-นามสกุล"]', label: 'ชื่อผู้ติดต่อหรือบริษัท', place: 'right' },
    ],
  });
});

test('37 — ห้องทำงานเรื่องรับเข้า', async ({ page }) => {
  await goto(page, '/intake');
  const row = page.locator('main :text("ตัวอย่างคู่มือ")').first();
  const target = (await row.count()) > 0 ? row : page.locator('main [class*="cursor-pointer"]').first();
  const count = await target.count().catch(() => 0);
  test.skip(count === 0, 'no intake row found to open');
  await target.click();
  await page.waitForURL(/\/intake\/[0-9a-f-]{10,}/i, { timeout: 10_000 }).catch(() => {});
  const opened = /\/intake\/[0-9a-f-]{10,}/i.test(page.url());
  test.skip(!opened, 'clicking a row did not open an intake workroom');
  await capture(page, {
    id: '37-intake-detail',
    title: 'ห้องทำงานเรื่องรับเข้า — คัดกรองก่อนเปิดคดี',
    route: '/intake/:id',
    description:
      'พื้นที่ทำงานของเรื่องรับเข้าหนึ่งเรื่อง จัดข้อเท็จจริง มอบหมายผู้รับผิดชอบ แนบเอกสาร และเมื่อพร้อมก็กดแปลงเป็นคดีจริงได้จากหน้านี้',
    callouts: [{ selector: 'h1', label: 'หัวข้อเรื่องรับเข้า', place: 'right' }],
  });
});

test('38 — เรื่องจาก Customer Portal', async ({ page }) => {
  await goto(page, '/intake/portal-submissions');
  await capture(page, {
    id: '38-intake-portal-submissions',
    title: 'เรื่องที่ส่งจาก Customer Portal',
    route: '/intake/portal-submissions',
    description: 'คำขอที่ลูกค้ากรอกเข้ามาเองผ่าน Client Portal (ก่อนเป็นลูกค้าในระบบ) พนักงานตรวจแล้วเลือกแปลงเป็นเรื่องรับเข้า/คดีได้',
    callouts: [{ selector: 'h1', label: 'หัวข้อหน้า', place: 'right' }],
  });
});

test('39 — รับเรื่องจากอีเมล', async ({ page }) => {
  await goto(page, '/email-intake');
  await capture(page, {
    id: '39-email-intake',
    title: 'รับเรื่องจากอีเมล — กล่องอีเมลที่เชื่อมต่อไว้',
    route: '/email-intake',
    description:
      'แสดงอีเมล/เธรดที่ระบบดึงมาจากกล่องอีเมลที่เชื่อมต่อ (Outlook) AI จะช่วยเสนอข้อมูลคดีเบื้องต้นให้ตรวจสอบก่อนรับเข้า คลิกแถวเพื่อเปิดดูรายละเอียด',
    callouts: [{ selector: 'h1', label: 'หัวข้อหน้า', place: 'right' }],
  });
});

test('40 — รายละเอียดอีเมลที่รับเข้า', async ({ page }) => {
  await goto(page, '/email-intake');
  const rows = page.locator('main [class*="cursor-pointer"], main tr, main li');
  const count = await rows.count().catch(() => 0);
  test.skip(count === 0, 'no email thread rows found');
  await rows.first().click().catch(() => {});
  await page.waitForTimeout(500);
  const stillOnList = /\/email-intake$/.test(page.url());
  test.skip(stillOnList, 'clicking a row did not open a thread');
  await capture(page, {
    id: '40-email-intake-thread',
    title: 'อีเมลรับเข้า — ตรวจสอบและยืนยันข้อมูล',
    route: '/email-intake/:threadId',
    description: 'อ่านเนื้อความอีเมลเต็ม ตรวจข้อมูลที่ AI เสนอ (ยืนยัน/ปฏิเสธทีละรายการ) แล้วกดยืนยันเพื่อสร้างเป็นเรื่องรับเข้า',
    callouts: [{ selector: 'h1', label: 'หัวข้ออีเมล', place: 'right' }],
  });
});

test('41 — บันทึกค่าใช้จ่ายใหม่', async ({ page }) => {
  await goto(page, '/expenses/new');
  await capture(page, {
    id: '41-expenses-new',
    title: 'บันทึกค่าใช้จ่ายใหม่',
    route: '/expenses/new',
    description: 'กรอกยอดเงิน รายละเอียด แนบใบเสร็จ และเลือกคดีที่เกี่ยวข้อง (ถ้ามี) เพื่อส่งขออนุมัติเบิกค่าใช้จ่าย',
    callouts: [
      { selector: 'input[type="number"]', label: 'ยอดเงิน (บาท)', place: 'right' },
      { selector: 'input[type="file"]', label: 'แนบใบเสร็จ/หลักฐาน', place: 'right' },
    ],
  });
});

test('42 — แบบฟอร์มเบิกค่าใช้จ่าย', async ({ page }) => {
  await goto(page, '/expenses/claim');
  await capture(page, {
    id: '42-expenses-claim',
    title: 'แบบฟอร์มเบิกค่าใช้จ่าย — พิมพ์/ส่งขออนุมัติ',
    route: '/expenses/claim',
    description: 'รวมรายการค่าใช้จ่ายที่ยังเป็นร่างเป็นแบบฟอร์มเบิกฉบับเดียว พิมพ์เป็น PDF หรือส่งให้เจ้าของสำนักงานอนุมัติทีเดียว',
    callouts: [
      { selector: 'button:has-text("Print"), button:has-text("พิมพ์")', label: 'พิมพ์แบบฟอร์ม', place: 'right' },
      { selector: 'button:has-text("Send"), button:has-text("ส่ง")', label: 'ส่งให้เจ้าของสำนักงานอนุมัติ', place: 'right' },
    ],
  });
});

test('43 — Playbooks', async ({ page }) => {
  await goto(page, '/playbooks');
  await capture(page, {
    id: '43-playbooks',
    title: 'Playbooks — ชุดงานมาตรฐานของแต่ละประเภทคดี',
    route: '/playbooks',
    description:
      'กำหนดชุดงาน/เอกสารมาตรฐานสำหรับคดีแต่ละประเภท (เช่น คดีอุบัติเหตุ คดีแพทย์) เมื่อเปิดคดีใหม่แล้วนำ Playbook มาใช้ ระบบจะสร้างงานตามชุดนี้ให้อัตโนมัติ',
    callouts: [
      { selector: 'h1', label: 'หัวข้อหน้า Playbooks', place: 'right' },
      { selector: 'a[href="/cases"]', label: 'ไปเลือกคดีเพื่อนำ Playbook ไปใช้', place: 'left' },
    ],
  });
});

test('44 — SOP / คู่มือการทำงาน', async ({ page }) => {
  await goto(page, '/sops');
  await capture(page, {
    id: '44-sops',
    title: 'SOP / คู่มือการทำงาน',
    route: '/sops',
    description: 'คลังคู่มือ/ขั้นตอนมาตรฐานภายในสำนักงาน ค้นหาได้ เจ้าของสำนักงานเพิ่ม/แก้ไข/ลบได้ ใช้อ้างอิงเวลาอบรมพนักงานใหม่',
    callouts: [
      { selector: 'input[placeholder*="ค้นหา SOP"]', label: 'ค้นหา SOP', place: 'bottom' },
      { selector: 'button:has-text("เพิ่ม SOP")', label: 'เพิ่ม SOP ใหม่ (เจ้าของสำนักงาน)', place: 'left' },
    ],
  });
});

test('45 — ภาระงานทีม (Operations)', async ({ page }) => {
  await goto(page, '/operations');
  await capture(page, {
    id: '45-operations',
    title: 'ภาระงานทีม — มอบหมายงานให้สมดุล',
    route: '/operations',
    description: 'ภาพรวมภาระงานของทีมทั้งหมด ดูว่าใครงานล้นใครงานว่าง แล้วมอบหมายงานเพิ่มเติมให้สมดุลกันได้จากหน้านี้',
    callouts: [{ selector: 'h1', label: 'หัวข้อหน้า ภาระงานทีม', place: 'right' }],
  });
});

test('46 — การใช้งาน AI', async ({ page }) => {
  await goto(page, '/ai-usage');
  await capture(page, {
    id: '46-ai-usage',
    title: 'การใช้งาน AI — ติดตามการใช้เครดิต',
    route: '/ai-usage',
    description: 'ดูว่าใครในทีมเรียกใช้ฟีเจอร์ AI (ค้นฎีกา สรุปเอกสาร) มากน้อยแค่ไหน สลับช่วงเวลาดู 7/14/30 วัน คลิกรายการเพื่อดูต้นทางของการเรียกนั้น',
    callouts: [{ selector: 'h1', label: 'หัวข้อหน้า การใช้งาน AI', place: 'right' }],
  });
});

test('47 — บันทึกการใช้งาน (Audit Log)', async ({ page }) => {
  await goto(page, '/admin/audit-log');
  await capture(page, {
    id: '47-admin-audit-log',
    title: 'บันทึกการใช้งาน — Audit Log (เฉพาะเจ้าของสำนักงาน)',
    route: '/admin/audit-log',
    description: 'ประวัติการกระทำสำคัญทุกอย่างในระบบ ใครทำอะไรเมื่อไหร่ กรองตามประเภทการกระทำได้ ใช้ตรวจสอบย้อนหลังเมื่อมีข้อสงสัย',
    callouts: [{ selector: 'h1', label: 'หัวข้อหน้า Audit Log', place: 'right' }],
  });
});

test('48 — กฎวันครบกำหนด (Deadline Rules)', async ({ page }) => {
  await goto(page, '/admin/deadline-rules');
  await capture(page, {
    id: '48-admin-deadline-rules',
    title: 'กฎวันครบกำหนด — คำนวณเดดไลน์อัตโนมัติ',
    route: '/admin/deadline-rules',
    description: 'ตั้งกฎให้ระบบคำนวณวันครบกำหนดของงานอัตโนมัติตามประเภทคดี/เหตุการณ์ (เช่น ยื่นอุทธรณ์ภายใน 30 วัน) ลดความเสี่ยงลืมกำหนด',
    callouts: [{ selector: 'button:has-text("Add rule"), button:has-text("เพิ่มกฎ")', label: 'เพิ่มกฎใหม่', place: 'left' }],
  });
});

test('49 — วันหยุดราชการ', async ({ page }) => {
  await goto(page, '/admin/holidays');
  await capture(page, {
    id: '49-admin-holidays',
    title: 'วันหยุดราชการ — ใช้คำนวณวันทำการ',
    route: '/admin/holidays',
    description: 'รายการวันหยุดราชการที่ระบบใช้นับวันทำการเวลาคำนวณกำหนดส่งงาน เพิ่มทีละวันหรือวางเป็นชุดได้ (Bulk add)',
    callouts: [
      { selector: 'textarea', label: 'วางรายการวันหยุดหลายวันพร้อมกัน', place: 'right' },
      { selector: 'button:has-text("Bulk add")', label: 'เพิ่มวันหยุดทั้งชุด', place: 'right' },
    ],
  });
});

test('50 — สมัครสำนักงานใหม่ (Register)', async ({ page, context }) => {
  await context.clearCookies();
  await goto(page, '/register');
  await capture(page, {
    id: '50-register',
    title: 'เริ่มต้นสำนักงานของคุณ — สมัครใช้งาน',
    route: '/register',
    description: 'หน้าสมัครสำนักงานใหม่ กรอกชื่อสำนักงาน อีเมล และรหัสผ่าน ระบบจะสร้างสำนักงาน (tenant) แยกของตัวเองให้ทันที',
    callouts: [
      { selector: 'input[type="email"]', label: 'อีเมลผู้ดูแลสำนักงาน', place: 'right' },
      { selector: 'button[type="submit"]', label: 'สร้างสำนักงาน', place: 'right' },
    ],
  });
});

test('51 — ลืมรหัสผ่าน', async ({ page, context }) => {
  await context.clearCookies();
  await goto(page, '/forgot-password');
  await capture(page, {
    id: '51-forgot-password',
    title: 'ลืมรหัสผ่าน — ขอลิงก์ตั้งรหัสผ่านใหม่',
    route: '/forgot-password',
    description: 'กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้ทางอีเมล',
    callouts: [{ selector: 'button[type="submit"]', label: 'ส่งลิงก์ตั้งรหัสผ่านใหม่', place: 'right' }],
  });
});

test('52 — หน้าแรก (Marketing)', async ({ page, context }) => {
  await context.clearCookies();
  await goto(page, '/');
  await capture(page, {
    id: '52-landing',
    title: 'หน้าแรกของ Samnuan',
    route: '/',
    description: 'หน้าแนะนำระบบสำหรับผู้ที่ยังไม่ได้เป็นลูกค้า อธิบายจุดเด่นของระบบและมีปุ่มขอทดลองใช้งานฟรี',
    callouts: [{ selector: 'a[href="/register"]', label: 'ขอทดลองใช้งานฟรี', place: 'right' }],
  });
});
