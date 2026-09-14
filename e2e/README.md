# E2E — คู่มือการใช้งาน + ตรวจ validation

Playwright ทำสองอย่างในชุดเดียว: ถ่ายคู่มือการใช้งานทีละหน้าจอ และตรวจว่าฟอร์มกันข้อมูลผิดจริง

## รันยังไง

ต้องมี dev server ทั้งสองตัวรันอยู่ก่อน (`pnpm dev` → web ที่ `:3005`, api ที่ `:3001`) และ seed ฐานข้อมูลแล้ว
(`pnpm db:seed` — ใช้บัญชี `admin@lawfirm.com` / `password123`)

```bash
pnpm e2e              # ทั้งหมด
pnpm e2e:guide        # ถ่ายภาพทุกหน้า + สร้างสไลด์ docs/user-guide/index.html
pnpm e2e:validation   # เฉพาะเทสต์ validation
pnpm e2e:journeys     # สมัคร/login/คำเชิญ/กู้รหัสผ่าน + หน้าทำงานและ responsive
pnpm e2e:pii          # เฉพาะเทสต์ PII
pnpm e2e:report       # เปิดรายงาน HTML
```

ตั้ง `E2E_WEB_URL` / `E2E_API_URL` ถ้าใช้พอร์ตอื่น

## ชุดตรวจการใช้งานจริง (12 กันยายน 2026)

```bash
pnpm exec playwright test --project=journeys --project=workspace --project=validation
```

- `journeys` ใช้ browser session ใหม่ เปิดสำนักงานผ่านฟอร์มจริง สร้างลูกค้า/คดี/ค่าใช้จ่ายร่าง/งาน/งานย่อย ตอบรับคำเชิญ ออกจากระบบ และเข้าซ้ำ
- ตรวจสิทธิ์ทนายทั้ง UI และ API และตรวจว่าบัญชีเจ้าของสำนักงานใหม่เปิดคดีของสำนักงาน seed ไม่ได้
- ตรวจอีเมลซ้ำ ชื่อว่าง API ขาดการเชื่อมต่อ ลิงก์ผิด/ใช้ซ้ำ session handoff และภาษาข้าม subdomain
- คำเชิญและ token กู้รหัสผ่านสร้างเป็น fixture ในฐานข้อมูล local เพื่อทดสอบการตอบรับโดยไม่ส่งอีเมลออกจริง
- ทุกบัญชีใช้ `e2e-<random>@example.test` ล้างเฉพาะผู้ใช้และสำนักงานของรอบนั้นใน `finally` ไม่ reseed ฐานข้อมูล
- `helpers/test-data.ts` ปฏิเสธฐานข้อมูลที่ไม่ใช่ localhost ส่วน `helpers/tenant-test.ts` ใช้ origin ที่ login ไปถึงจริง
- `workspace` ตรวจเปิดหน้าหลังล็อกอิน 29 เส้นทาง + search + recovery จากทีมโหลดผิดพลาด + TH/EN ที่ 375 และ 1440px
- `journeys` ตรวจหน้าสมัครและ login ที่ 320, 375, 414, 768, 1440px และแนบ screenshot ในรายงาน
- การรันตรวจปกติไม่เขียนทับคู่มือผู้ใช้; `pnpm e2e:guide` เปิด `E2E_CAPTURE_GUIDE=1` สำหรับสร้างภาพคู่มือโดยเฉพาะ
- เทสต์บันทึก draft ค่าใช้จ่าย ไม่กดส่งใบเบิก/จ่ายเงิน และไม่เรียกวิเคราะห์ AI หรือบริการที่คิดเครดิต

## โครงสร้าง

| ไฟล์ | หน้าที่ |
| --- | --- |
| `tests/auth.setup.ts` | ล็อกอิน admin เก็บ session ไว้ใช้ทุก project + ถ่ายหน้า Login |
| `tests/guide.spec.ts` | เดินทีละหน้า ถ่ายภาพพร้อมกรอบ/ป้ายสีแดง |
| `tests/validation.spec.ts` | ตรวจฟิลด์ตัวเลข/รูปแบบข้อความ ทั้งฝั่ง UI และ API |
| `tests/pii.spec.ts` | ตรวจการ mask PII, การแยก tenant/portal, และภาพในคู่มือ |
| `helpers/annotate.ts` | วาดกรอบแดง + ป้ายเลขกำกับลงบนหน้าจริง แล้ว screenshot แบบเต็มหน้า |
| `build-deck.mjs` | รวม `slides.json` + ภาพ เป็นสไลด์ HTML ไฟล์เดียว |

## เพิ่มสไลด์ใหม่

เพิ่ม `test()` ใน `guide.spec.ts` แล้วเรียก `capture()` — `selector` รับ Playwright selector ได้ทุกแบบ
(`:has-text()`, `text=`, CSS) ถ้าหา element ไม่เจอจะข้ามป้ายนั้นไปเงียบ ๆ ไม่ทำให้เทสต์ล้ม

```ts
await capture(page, {
  id: '25-something',
  title: 'ชื่อสไลด์',
  route: '/something',
  description: 'อธิบายว่าหน้านี้ใช้ทำอะไร',
  callouts: [{ selector: 'button:has-text("บันทึก")', label: 'กดเพื่อบันทึก', place: 'right' }],
});
```

จากนั้นรัน `pnpm e2e:guide` เพื่อสร้างสไลด์ใหม่

## PII

กติกาของโปรเจกต์: **ข้อมูลระบุตัวตนที่ออกจากฐานข้อมูล ต้อง mask เสมอ** — audit log, log ของแอป, ข้อความ error,
ไฟล์ export และภาพในคู่มือ ส่วนที่ต้องใช้ค่าจริง (แถว contact เอง, ที่อยู่ผู้รับอีเมลขาออก) คือข้อยกเว้นเดียว

ตัวช่วยทั้งหมดอยู่ที่ [`packages/shared/src/pii.ts`](../packages/shared/src/pii.ts)

| ฟังก์ชัน | ตัวอย่าง |
| --- | --- |
| `maskEmail` | `john.smith@email.com` → `j***h@e***l.com` |
| `maskPhone` | `081-234-5678` → `******5678` |
| `maskNationalId` | `1-2345-67890-12-3` → `*********0123` |
| `maskName` | `สมชาย ใจดี` → `ส*** ใ***` |
| `maskPiiObject` | mask ตามชื่อคีย์ + ลบ `password`/`token` ทิ้งเป็น `[redacted]` |
| `maskPiiText` | ล้าง PII ในข้อความอิสระ (log message, DOM) |

**ภาพในคู่มือ:** `capture()` เรียก `maskPii(page)` ทุกครั้งก่อนกดชัตเตอร์ — แก้ค่าใน DOM จริง ไม่ใช่เบลอทับ PNG
ทีหลัง ดังนั้นภาพที่ commit ลง repo จะไม่มีอีเมล/เบอร์โทร/เลขบัตรจริงเลย ส่วน**ชื่อคน**ตั้งใจไม่ mask เพราะ
เป็น seed data และคู่มือต้องอ่านรู้เรื่อง ถ้าจะถ่ายจากฐานข้อมูลจริงต้องเพิ่ม `maskName` เข้าไปด้วย

**หมายเหตุ:** เทสต์ `เจ้าของสำนักงานอื่นเปิดคดีของเราไม่ได้` สมัครสำนักงานใหม่ทุกครั้งที่รัน จะทิ้งแถว
`PII Outsider Firm` ไว้ใน dev DB — ล้างด้วย `pnpm db:seed` ได้

### Court-day workflow

`pnpm exec playwright test --project=court-day` exercises preparation, versioned file download, atomic hearing outcomes, duplicate requests, concurrent edits, tenant/case permissions, temporary draft recovery and TH/EN responsive layouts. It creates only local disposable firms and files and cleans them afterwards. The rollback proof uses the compiled API service in `apps/api/dist`; keep the API dev compiler running (or build the API first) with the current Prisma client and court-day migration applied. No email or AI requests are sent by this suite.
