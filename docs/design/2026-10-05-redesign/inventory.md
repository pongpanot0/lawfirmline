# Samnuan redesign inventory

Source baseline: 2026-10-05, commit 789a749014da. All 120 listed routes inherit the implemented Editorial Juris system in root `design.md`.

Coverage means shared visual implementation, with page-owned palette exceptions reconciled. It does not mean every native screen has been observed on a device. Local checks and representative visual evidence are recorded in `verification.md`.

## Web — 79 pages

| File | Purpose |
| --- | --- |
| `apps/web/src/app/page.tsx` | หน้าเว็บสาธารณะอธิบายผลิตภัณฑ์ |
| `apps/web/src/app/(auth)/forgot-password/page.tsx` | ขอรีเซ็ตรหัสผ่าน |
| `apps/web/src/app/(auth)/handoff/page.tsx` | ส่งต่อการเข้าใช้งาน |
| `apps/web/src/app/(auth)/invite/[token]/page.tsx` | รับคำเชิญ |
| `apps/web/src/app/(auth)/join/[slug]/page.tsx` | เข้าร่วมสำนักงาน |
| `apps/web/src/app/(auth)/login/page.tsx` | เข้าสู่ระบบ |
| `apps/web/src/app/(auth)/register/page.tsx` | สมัครใช้งาน |
| `apps/web/src/app/(auth)/reset-password/page.tsx` | ตั้งรหัสผ่านใหม่ |
| `apps/web/src/app/(client-portal)/portal/page.tsx` | พอร์ทัลลูกความ |
| `apps/web/src/app/(client-portal)/portal/cases/[id]/page.tsx` | พอร์ทัลลูกความ / ทะเบียนและรายละเอียดคดี |
| `apps/web/src/app/(client-portal)/portal/check-email/page.tsx` | พอร์ทัลลูกความ / ตรวจอีเมลยืนยัน |
| `apps/web/src/app/(client-portal)/portal/intake/page.tsx` | พอร์ทัลลูกความ / รับเรื่อง |
| `apps/web/src/app/(client-portal)/portal/intake/[id]/page.tsx` | พอร์ทัลลูกความ / รับเรื่อง |
| `apps/web/src/app/(client-portal)/portal/intake/new/page.tsx` | พอร์ทัลลูกความ / รับเรื่อง / เพิ่มรายการ |
| `apps/web/src/app/(client-portal)/portal/invite/[token]/page.tsx` | พอร์ทัลลูกความ / รับคำเชิญ |
| `apps/web/src/app/(client-portal)/portal/login/page.tsx` | พอร์ทัลลูกความ / เข้าสู่ระบบ |
| `apps/web/src/app/(client-portal)/portal/operations/page.tsx` | พอร์ทัลลูกความ / งานประจำวัน |
| `apps/web/src/app/(client-portal)/portal/reports/page.tsx` | พอร์ทัลลูกความ / รายงาน |
| `apps/web/src/app/(client-portal)/portal/reports/[id]/page.tsx` | พอร์ทัลลูกความ / รายงาน |
| `apps/web/src/app/(client-portal)/portal/set-password/page.tsx` | พอร์ทัลลูกความ / ตั้งรหัสผ่าน |
| `apps/web/src/app/(client-portal)/portal/settings/page.tsx` | พอร์ทัลลูกความ / ตั้งค่า |
| `apps/web/src/app/(client-portal)/portal/verify/page.tsx` | พอร์ทัลลูกความ / ยืนยันการเข้าใช้งาน |
| `apps/web/src/app/(dashboard)/account/billing/page.tsx` | บัญชีผู้ใช้ / การเงินและสมาชิก |
| `apps/web/src/app/(dashboard)/account/billing/checkout/page.tsx` | บัญชีผู้ใช้ / การเงินและสมาชิก / ชำระค่าสมาชิก |
| `apps/web/src/app/(dashboard)/admin/audit-log/page.tsx` | ดูแลระบบ / ประวัติการดำเนินการ |
| `apps/web/src/app/(dashboard)/admin/case-types/page.tsx` | ดูแลระบบ / ประเภทคดี |
| `apps/web/src/app/(dashboard)/admin/courts/page.tsx` | ดูแลระบบ / ศาล |
| `apps/web/src/app/(dashboard)/admin/deadline-rules/page.tsx` | ดูแลระบบ / กฎกำหนดเวลา |
| `apps/web/src/app/(dashboard)/admin/holidays/page.tsx` | ดูแลระบบ / วันหยุด |
| `apps/web/src/app/(dashboard)/admin/reimbursements/page.tsx` | ดูแลระบบ / ตรวจคำขอเบิก |
| `apps/web/src/app/(dashboard)/admin/users/page.tsx` | ดูแลระบบ / ผู้ใช้งาน |
| `apps/web/src/app/(dashboard)/admin/users/new/page.tsx` | ดูแลระบบ / ผู้ใช้งาน / เพิ่มรายการ |
| `apps/web/src/app/(dashboard)/ai-usage/page.tsx` | การใช้งาน AI |
| `apps/web/src/app/(dashboard)/calendar/page.tsx` | ปฏิทิน |
| `apps/web/src/app/(dashboard)/cases/page.tsx` | ทะเบียนและรายละเอียดคดี |
| `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` | ทะเบียนและรายละเอียดคดี |
| `apps/web/src/app/(dashboard)/cases/[id]/billing/page.tsx` | ทะเบียนและรายละเอียดคดี / การเงินและสมาชิก |
| `apps/web/src/app/(dashboard)/cases/[id]/calendar/page.tsx` | ทะเบียนและรายละเอียดคดี / ปฏิทิน |
| `apps/web/src/app/(dashboard)/cases/[id]/closing-report/page.tsx` | ทะเบียนและรายละเอียดคดี / รายงานปิดคดี |
| `apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx` | ทะเบียนและรายละเอียดคดี / เอกสาร |
| `apps/web/src/app/(dashboard)/cases/[id]/documents/[documentId]/review/page.tsx` | ทะเบียนและรายละเอียดคดี / เอกสาร / ตรวจเอกสาร |
| `apps/web/src/app/(dashboard)/cases/[id]/insurance/page.tsx` | ทะเบียนและรายละเอียดคดี / ข้อมูลประกันภัย |
| `apps/web/src/app/(dashboard)/cases/[id]/messages/page.tsx` | ทะเบียนและรายละเอียดคดี / ข้อความ |
| `apps/web/src/app/(dashboard)/cases/[id]/tasks/page.tsx` | ทะเบียนและรายละเอียดคดี / งาน |
| `apps/web/src/app/(dashboard)/cases/board/page.tsx` | ทะเบียนและรายละเอียดคดี / บอร์ดคดี |
| `apps/web/src/app/(dashboard)/cases/new/page.tsx` | ทะเบียนและรายละเอียดคดี / เพิ่มรายการ |
| `apps/web/src/app/(dashboard)/clients/page.tsx` | ลูกความ |
| `apps/web/src/app/(dashboard)/clients/new/page.tsx` | ลูกความ / เพิ่มรายการ |
| `apps/web/src/app/(dashboard)/court-day/[eventId]/page.tsx` | เตรียมตัววันขึ้นศาล |
| `apps/web/src/app/(dashboard)/court-schedule/page.tsx` | นัดศาล |
| `apps/web/src/app/(dashboard)/dashboard/page.tsx` | ภาพรวมและคิวงานสำนักงาน |
| `apps/web/src/app/(dashboard)/documents/page.tsx` | เอกสาร |
| `apps/web/src/app/(dashboard)/email-intake/page.tsx` | รับเรื่องทางอีเมล |
| `apps/web/src/app/(dashboard)/email-intake/[threadId]/page.tsx` | รับเรื่องทางอีเมล |
| `apps/web/src/app/(dashboard)/expenses/page.tsx` | ค่าใช้จ่ายและเบิกจ่าย |
| `apps/web/src/app/(dashboard)/expenses/claim/page.tsx` | ค่าใช้จ่ายและเบิกจ่าย / ยื่นเบิก |
| `apps/web/src/app/(dashboard)/expenses/new/page.tsx` | ค่าใช้จ่ายและเบิกจ่าย / เพิ่มรายการ |
| `apps/web/src/app/(dashboard)/getting-started/page.tsx` | เริ่มต้นใช้งาน |
| `apps/web/src/app/(dashboard)/intake/page.tsx` | รับเรื่อง |
| `apps/web/src/app/(dashboard)/intake/[id]/page.tsx` | รับเรื่อง |
| `apps/web/src/app/(dashboard)/intake/new/page.tsx` | รับเรื่อง / เพิ่มรายการ |
| `apps/web/src/app/(dashboard)/intake/portal-submissions/page.tsx` | รับเรื่อง / เรื่องที่ลูกความส่งเข้า |
| `apps/web/src/app/(dashboard)/invoices/page.tsx` | ใบแจ้งหนี้ |
| `apps/web/src/app/(dashboard)/knowledge/page.tsx` | คลังความรู้ |
| `apps/web/src/app/(dashboard)/leaves/page.tsx` | การลา |
| `apps/web/src/app/(dashboard)/my-day/page.tsx` | งานวันนี้ |
| `apps/web/src/app/(dashboard)/operations/page.tsx` | งานประจำวัน |
| `apps/web/src/app/(dashboard)/playbooks/page.tsx` | แม่แบบขั้นตอน |
| `apps/web/src/app/(dashboard)/playbooks/[id]/page.tsx` | แม่แบบขั้นตอน |
| `apps/web/src/app/(dashboard)/reports/page.tsx` | รายงาน |
| `apps/web/src/app/(dashboard)/research/page.tsx` | ค้นคว้า |
| `apps/web/src/app/(dashboard)/settings/page.tsx` | ตั้งค่า |
| `apps/web/src/app/(dashboard)/sops/page.tsx` | คู่มือขั้นตอนงาน |
| `apps/web/src/app/(dashboard)/team/page.tsx` | ทีมและภาระงาน |
| `apps/web/src/app/(dashboard)/todos/page.tsx` | งานและการตรวจงาน |
| `apps/web/src/app/(dashboard)/work/page.tsx` | งานผู้รับงานภายนอก |
| `apps/web/src/app/(dashboard)/workflows/page.tsx` | เวิร์กโฟลว์ |
| `apps/web/src/app/delete-account/page.tsx` | ขอลบบัญชี |
| `apps/web/src/app/privacy/page.tsx` | นโยบายความเป็นส่วนตัว |

## Native mobile — 41 screens

| File | Purpose |
| --- | --- |
| `apps/mobile/app/(auth)/forgot-password.tsx` | ขอรีเซ็ตรหัสผ่าน |
| `apps/mobile/app/(auth)/login.tsx` | เข้าสู่ระบบ |
| `apps/mobile/app/(auth)/register.tsx` | สมัครใช้งาน |
| `apps/mobile/app/(tabs)/calendar.tsx` | ปฏิทิน |
| `apps/mobile/app/(tabs)/cases.tsx` | ทะเบียนและรายละเอียดคดี |
| `apps/mobile/app/(tabs)/index.tsx` | หน้าหลัก / รายการ |
| `apps/mobile/app/(tabs)/tasks.tsx` | งาน |
| `apps/mobile/app/(tabs)/team.tsx` | ทีมและภาระงาน |
| `apps/mobile/app/account.tsx` | บัญชีผู้ใช้ |
| `apps/mobile/app/case/[id].tsx` | คดี |
| `apps/mobile/app/case/[id]/close.tsx` | คดี / ปิดคดี |
| `apps/mobile/app/case/new.tsx` | คดี / เพิ่มรายการ |
| `apps/mobile/app/clients/[id].tsx` | ลูกความ |
| `apps/mobile/app/clients/index.tsx` | ลูกความ / หน้าหลัก / รายการ |
| `apps/mobile/app/court-day/[eventId].tsx` | เตรียมตัววันขึ้นศาล |
| `apps/mobile/app/delete-account.tsx` | ขอลบบัญชี |
| `apps/mobile/app/document-template.tsx` | แม่แบบเอกสาร |
| `apps/mobile/app/document-waiting.tsx` | เอกสารรอดำเนินการ |
| `apps/mobile/app/event/[id]/team.tsx` | นัดหมาย / ทีมและภาระงาน |
| `apps/mobile/app/event/new.tsx` | นัดหมาย / เพิ่มรายการ |
| `apps/mobile/app/expenses/claim/[id].tsx` | ค่าใช้จ่ายและเบิกจ่าย / ยื่นเบิก |
| `apps/mobile/app/expenses/claims.tsx` | ค่าใช้จ่ายและเบิกจ่าย / รายการคำขอเบิก |
| `apps/mobile/app/expenses/index.tsx` | ค่าใช้จ่ายและเบิกจ่าย / หน้าหลัก / รายการ |
| `apps/mobile/app/expenses/new.tsx` | ค่าใช้จ่ายและเบิกจ่าย / เพิ่มรายการ |
| `apps/mobile/app/intake/new.tsx` | รับเรื่อง / เพิ่มรายการ |
| `apps/mobile/app/invoice/[id].tsx` | ใบแจ้งหนี้ |
| `apps/mobile/app/knowledge.tsx` | คลังความรู้ |
| `apps/mobile/app/leaves.tsx` | การลา |
| `apps/mobile/app/more.tsx` | เมนูเพิ่มเติม |
| `apps/mobile/app/notifications.tsx` | การแจ้งเตือน |
| `apps/mobile/app/operations.tsx` | งานประจำวัน |
| `apps/mobile/app/owner-decisions.tsx` | รอเจ้าของสำนักงานตัดสินใจ |
| `apps/mobile/app/owner-finance.tsx` | การเงินเจ้าของสำนักงาน |
| `apps/mobile/app/person/[id].tsx` | คิวงานของบุคคล |
| `apps/mobile/app/reports.tsx` | รายงาน |
| `apps/mobile/app/scan/[caseId].tsx` | สแกนเอกสาร |
| `apps/mobile/app/search.tsx` | ค้นหา |
| `apps/mobile/app/settings.tsx` | ตั้งค่า |
| `apps/mobile/app/task/blocker.tsx` | งาน / แจ้งงานติดขัด |
| `apps/mobile/app/task/new.tsx` | งาน / เพิ่มรายการ |
| `apps/mobile/app/team-week.tsx` | ตารางทีมรายสัปดาห์ |

## Shared design owners

- Web foundation: `apps/web/src/app/globals.css`, `apps/web/tailwind.config.js`, root layout fonts.
- Staff shell: `apps/web/src/components/layout/{AppShell,SamnuanSidebar,TopNavbar}.tsx`.
- Portal shell: `apps/web/src/components/layout/{PortalShell,PortalSidebar}.tsx`.
- Titles and controls: `apps/web/src/components/samnuan/PageHeader.tsx`, `apps/web/src/components/ui/`.
- Case detail: route-local `tokens.css` and `case-detail.module.css`; reconcile with shared system.
- Public site: `apps/web/src/components/landing/`, its scoped tokens and existing GSAP motion.
- Brand: `apps/web/src/components/brand/SamnuanLogo.tsx` and Balance assets.
- Native: `apps/mobile/design.md`, `apps/mobile/src/theme.ts`, shared components and screen composition.

## Findings

- Web base, public landing and native palettes differ; map a coherent identity onto existing token surfaces.
- Legal identifiers dominate the wide case register. Preserve access while giving next actions and responsibility a clearer first scan.
- Forms already fold some optional sections. Retain that reduction and improve consistent labels/spacing.
- Staff/client route and permission boundaries remain part of the product.
- No local web/API server was running during inventory; this document records source findings, not browser proof.
