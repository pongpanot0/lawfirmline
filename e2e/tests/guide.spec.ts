import { test, expect, Page } from '@playwright/test';
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
  await expect(page.locator('main h1')).toContainText('แดชบอร์ด');
  await expect(page.getByText('คดีทั้งหมด').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'กำไรแต่ละคดี' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'นัดศาลที่จะถึง' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ทางลัด' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'สร้างคดีใหม่' }).last()).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    )
    .toBe(true);
}

test.describe.configure({ mode: 'serial' });

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
    title: 'แดชบอร์ด — ภาพรวมสำนักงาน',
    route: '/dashboard',
    description:
      'หน้าแรกหลังเข้าสู่ระบบ บอกว่าวันนี้มีนัดอะไรและกำลังทำงานไหนค้างอยู่ พร้อมสรุปจำนวนคดี คดีที่ดำเนินอยู่ นัดศาลที่จะถึง รายได้เดือนนี้ และทางลัดสร้างคดี/เพิ่มนัดศาล/อัปโหลดเอกสาร',
    callouts: [
      ...CHROME,
      { selector: 'h1', label: 'ชื่อหน้าและคำทักทายผู้ใช้', place: 'right' },
      { selector: 'main .grid > div', label: 'การ์ดสรุปตัวเลขสำคัญ (KPI)', place: 'bottom' },
      { selector: 'main :text("วันนี้")', label: 'นัดหมายและงานที่ครบกำหนดวันนี้', place: 'right' },
      { selector: 'main :text("กำลังทำอยู่")', label: 'งานที่คุณกำลังทำค้างอยู่', place: 'left' },
      { selector: 'button:has-text("สร้างคดีใหม่")', label: 'ปุ่มลัด สร้างคดีใหม่', place: 'left', nth: 1 },
    ],
  });
});

test('02.1 — แดชบอร์ด smoke และทางลัด', async ({ page }) => {
  await goto(page, '/dashboard');
  await expectDashboardLoaded(page);

  await page.getByRole('button', { name: 'สร้างคดีใหม่' }).last().click();
  await expect(page).toHaveURL(/\/cases\/new$/);

  await goto(page, '/dashboard');
  await page.getByRole('button', { name: 'เพิ่มนัดศาล' }).click();
  await expect(page).toHaveURL(/\/court-schedule$/);

  await goto(page, '/dashboard');
  await page.getByRole('button', { name: 'อัปโหลดเอกสาร' }).click();
  await expect(page).toHaveURL(/\/documents$/);

  await goto(page, '/dashboard');
  await page.getByRole('button', { name: 'เพิ่มลูกค้า' }).click();
  await expect(page).toHaveURL(/\/clients\/new$/);
});

test('02.2 — แดชบอร์ด mobile ไม่มีหน้าล้น', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await goto(page, '/dashboard');
  await expectDashboardLoaded(page);
  await expectNoHorizontalOverflow(page);
});

test('02.3 — action ต่อคดียก case context ไปใช้ต่อ', async ({ page }) => {
  test.skip(!caseId, 'no seeded case found');
  await goto(page, '/dashboard');
  const firstRow = page.locator('main tbody tr').first();
  await expect(firstRow.getByRole('link', { name: 'นัด' })).toHaveAttribute('href', `/cases/${caseId}/calendar`);
  await expect(firstRow.getByRole('link', { name: 'เอกสาร' })).toHaveAttribute('href', `/cases/${caseId}/documents`);
  await expect(firstRow.getByRole('link', { name: 'เบิก' })).toHaveAttribute('href', `/expenses/new?caseId=${caseId}`);

  await goto(page, `/expenses/new?caseId=${caseId}`);
  await expect(page.locator('main select').last()).toHaveValue(caseId);

  await goto(page, `/documents?caseId=${caseId}`);
  await expect(page.locator('main select').last()).toHaveValue(caseId);
});

test('03 — รายการคดี', async ({ page }) => {
  await goto(page, '/cases');
  await capture(page, {
    id: '03-cases-list',
    title: 'คดี — รายการคดีทั้งหมด',
    route: '/cases',
    description:
      'ตารางคดีทั้งหมดของสำนักงาน ค้นหาด้วย Own Ref / Customer Ref / เลขดำ / เลขแดง / ชื่อลูกค้า กรองตามสถานะ และส่งออกเป็นไฟล์ได้',
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
      'กรอกข้อมูลคดี Own Ref ถูกสร้างอัตโนมัติ (TSBREF + ปี + เลขรัน) ส่วนเลขดำ/เลขแดงกรอกในรูปแบบ เลขที่/ปีพ.ศ. เช่น 123/2567 และระบุลูกค้ากับรายได้โดยประมาณ',
    callouts: [
      { selector: 'input[placeholder*="เลขอ้างอิงจากลูกค้า"]', label: 'Customer Ref เลขอ้างอิงฝั่งลูกค้า (ไม่บังคับ)', place: 'right' },
      { selector: 'input[placeholder="เช่น 123/2567"]', label: 'เลขดำ รูปแบบ 123/2567', place: 'right' },
      { selector: 'input[placeholder="เช่น 456/2567"]', label: 'เลขแดง รูปแบบ 456/2567', place: 'right' },
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
    description: 'แก้ไขชื่อผู้ใช้ สลับโหมดสว่าง/มืด และเชื่อมต่อ LINE Official Account เพื่อรับการแจ้งเตือน',
    callouts: [
      { selector: 'main input', label: 'ข้อมูลโปรไฟล์ (อีเมลแก้ไขไม่ได้)', place: 'right' },
      { selector: 'button:has-text("Save Changes")', label: 'บันทึกการเปลี่ยนแปลง', place: 'right' },
      { selector: 'button:has-text("Switch to Dark")', label: 'สลับธีมสว่าง/มืด', place: 'right' },
      { selector: 'button:has-text("เชื่อมต่อ LINE")', label: 'เชื่อมต่อแจ้งเตือนผ่าน LINE', place: 'right' },
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
      'ลูกค้าเข้าใช้งานด้วย magic link ไม่ต้องจำรหัสผ่าน กรอกอีเมลที่สำนักงานเปิดสิทธิ์ไว้ ระบบจะส่งลิงก์เข้าสู่ระบบไปให้ทางอีเมล',
    callouts: [
      { selector: 'input[type="email"]', label: 'อีเมลของลูกค้า', place: 'right' },
      { selector: 'button[type="submit"]', label: 'ขอลิงก์เข้าสู่ระบบ', place: 'right' },
    ],
  });
});
