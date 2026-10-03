# ตรวจความปลอดภัย + PDPA + PII — 2026-10-03

Branch: `claude/app-notifications-system-775b93` (PR #83)

## วิธีตรวจ

- อ่านโค้ด API ทีละ route ครบ 66 controller (~400 route) ว่าทุก id ที่รับเข้ามาผูกกับสำนักงาน (firmId) และสิทธิ์ของผู้เรียกหรือไม่
- ตรวจ PDPA ตามหมวด: ฐานกฎหมาย/ความยินยอม, สิทธิเจ้าของข้อมูล, ระยะเก็บ, มาตรการความปลอดภัย, ส่งข้อมูลต่างประเทศ, แจ้งเหตุละเมิด
- ไล่เส้นทางข้อมูลส่วนบุคคล (PII): API response, AI, push, LINE, log, เครื่องผู้ใช้; ทดสอบ `redactForAi` กับรูปแบบจริง
- **ไม่ได้ยิงทดสอบสด (dynamic pentest)** — ขั้นตอนนั้นถูกระงับระหว่างทาง ผลทั้งหมดมาจากการอ่านโค้ดและ unit test ไม่ได้แตะ production

## แก้แล้วใน PR นี้

| ระดับ | ปัญหา | แก้ |
|---|---|---|
| Critical | `/users` ไม่กรองตามสำนักงาน: owner ของสำนักงานใดก็เห็น user ทุกสำนักงาน เปลี่ยนรหัสผ่าน/ลบบัญชีคนอื่นได้ และเห็น LINE link code (ผูก LINE ตัวเองเข้าบัญชีคนอื่นได้) | ผูกทุก route กับสำนักงาน, คืนเฉพาะฟิลด์ที่ปลอดภัย, แก้ได้แค่ชื่อ, ปิดการลบ user (ใช้ `/saas/members`) |
| Critical | Omise webhook เชื่อ payload ทั้งก้อน — ใครก็ POST "จ่ายแล้ว" เปิด subscription ฟรีได้ | ดึง charge จาก Omise เอง, เปิดใช้ตาม invoice ของเรา ไม่ใช้ metadata ที่ส่งมา |
| High | รับคำเชิญด้วย token อย่างเดียว = login เป็นบัญชีเดิมของอีเมลนั้นได้ (คนเชิญถือ token อยู่แล้ว) ข้าม MFA | บัญชีเดิมต้องใส่รหัสผ่านของตัวเอง แล้ว login ตามปกติ (รวม MFA) |
| High | ออกใบแจ้งหนี้ถึงลูกความของสำนักงานอื่น → เห็นเลขภาษี/ที่อยู่ และส่ง LINE ทวงเงินหาลูกความเขาได้ | ตรวจ bill-to / splits ต้องเป็นลูกความของสำนักงาน |
| High | แก้ลูกความ แล้วแนบ id ผู้ติดต่อของที่อื่น → แก้อีเมล/เปิด portal ยึดบัญชี portal ได้ | แก้ได้เฉพาะผู้ติดต่อของลูกความรายนั้น |
| High | Intake/คดี รับ clientId/contactId/caseTypeId/userId ของสำนักงานอื่น → ข้อมูลรั่วผ่าน include | helper เดียว `assertFirmRefs` ใช้ทุกจุด (คดี, intake, decide, convert, assess, follow-up, ใบแจ้งหนี้, hold follower) |
| High | ศาล, วันหยุดราชการ, กฎกำหนดระยะเวลา เป็นข้อมูลกลางทุกสำนักงาน แต่ owner ใดก็แก้/ลบได้ (กระทบการคำนวณวันครบกำหนดของทุกสำนักงาน) | ต้องเป็น platform admin ใน `PLATFORM_ADMIN_EMAILS` |
| High | ไม่มี rate limit เลย — เดารหัสผ่าน/OTP/magic link ได้ไม่จำกัด | `@nestjs/throttler`: auth 10 ครั้ง/นาที, endpoint ส่งอีเมล 5 ครั้ง/10 นาที, ทั่วไป 600/นาที; webhook ยกเว้น |
| High | ถ้า prod ไม่ได้ตั้ง JWT secret ระบบจะใช้ค่า dev ที่อยู่ใน repo → ปลอม token ได้ | prod ไม่ยอม start ถ้าไม่มี secret |
| Medium | email-intake ผูก relatedCaseId ของคดีที่ไม่มีสิทธิ์/ของที่อื่น | ต้องเป็นคดีที่ผู้ใช้เข้าถึงได้ |
| Medium | วิเคราะห์เอกสารด้วย documentId ใน query ที่ไม่ใช่ของคดี | ต้องเป็นเอกสารในคดีนั้น |
| Medium | blockedById ชี้งานของที่อื่น (รู้สถานะงานเขา) | ต้องเป็นงานที่ผู้ใช้เห็น |
| Medium | ผู้ติดตามงานพัก (follower) เป็นคนนอกสำนักงานได้ → ได้รับแจ้งเตือนคดี | ตรวจสมาชิก + hub แจ้งเตือนส่งเฉพาะสมาชิกสำนักงาน |
| Medium | staff ทุกบทบาทสร้างลิงก์เชิญ portal = เข้า portal เป็นลูกความได้ | เฉพาะ OWNER / SENIOR_LAWYER |
| Medium | Reset password ไม่ตัด session เดิม; token ใช้ซ้ำได้ถ้ายิงพร้อมกัน | claim แบบ atomic + ตัดทุก session |
| Medium | กล่องอีเมล Outlook ใครในสำนักงานก็ตัด/สั่ง sync ได้ | เฉพาะคนที่เชื่อมเองหรือ owner |
| Medium | Portal: firmId มาจาก token; message คืน storage key ภายใน | ใช้ firm จาก DB, ตัด storagePath |
| Medium | `mock-reply` (ปลอมอีเมลลูกความ) เปิดใน prod | ปิดใน production |
| Medium | Dev flag (`CLIENT_PORTAL_EXPOSE_DEV_TOKEN`, `OMISE_SKIP_TLS_VERIFY`) มีผลใน prod ได้ถ้าตั้งพลาด | ไม่มีผลใน production เสมอ |
| PDPA | `extractDatesWithAI` ส่งข้อความเอกสารดิบไป OpenAI (จุดเดียวที่ไม่ redact) | redact แล้ว |
| PDPA | `redactForAi` หลุด: เลขไทย ๐-๙, เบอร์ (081) / 081.234 / 66-81, passport ตัวเล็ก/มีช่องว่าง, เลขบัญชี, LINE ID | เพิ่มกฎ + test (ยังเก็บวันที่ เงิน เลขคดีไว้ครบ) |
| PDPA | คำถาม precedent ส่ง iApp ใน URL แบบไม่ redact | redact แล้ว |
| PDPA | log อีเมลผู้รับ / ข้อความ LINE / payload Omise เต็ม | mask / ไม่ log เนื้อหา |
| PDPA | mobile เก็บ cache คดี/ลูกความ 7 วัน แม้ logout | ลบ cache ตอน logout (draft ที่ยังไม่บันทึกเก็บไว้) |
| Low | ไม่มี security headers | helmet |

## ยังไม่ได้แก้ — ต้องตัดสินใจหรือเป็นงานใหญ่

| ระดับ | เรื่อง | ทำไมยังไม่แก้ / ข้อเสนอ |
|---|---|---|
| **High** | `/firms/:slug/join` — ใครก็สมัครเป็น ASSISTANT ของสำนักงานไหนก็ได้ โดยไม่ต้องอนุมัติ | เป็น feature onboarding ที่อาจใช้อยู่ — เสนอ: ปิดเป็นค่าเริ่มต้น + owner เปิดเอง หรือให้ owner อนุมัติก่อนใช้งานได้ |
| Medium | Expense ที่ไม่ผูกคดีของ user ที่อยู่หลายสำนักงาน ข้ามสำนักงานกันได้ | ต้องเพิ่ม `firmId` ใน Expense (migration) |
| Medium | เลขใบแจ้งหนี้ unique ทั้งระบบ — สำนักงานหนึ่งจองเลขล่วงหน้าทำให้อีกที่ออกบิลไม่ได้ | เปลี่ยน unique เป็น (firmId, invoiceNumber) — migration |
| Medium | Outlook OAuth state ไม่ผูกกับ browser (ส่งลิงก์ให้คนอื่นกดยินยอม แล้วกล่องเขาเข้าสำนักงานเรา) | เก็บ nonce ใน HttpOnly cookie + ใช้ครั้งเดียว |
| Medium | Portal login ด้วยอีเมลซ้ำข้ามสำนักงาน → อาจเข้า portal ผิดสำนักงาน | ให้เลือกสำนักงานเมื่อมีหลายรายการ |
| Medium | Intake บางจุดเช็คแค่ firm ไม่เช็คว่า LAWYER/ASSISTANT ได้รับมอบหมาย (ในสำนักงานเดียวกัน) | ใช้ `getIntakeFilterForUser` ทุกจุด |
| Medium | ลบงาน/พักงานในคดี ไม่เช็คว่าเห็นงานนั้น (ในสำนักงานเดียวกัน) | ส่ง user เข้า + `assertAccess` |
| Medium | token login/reset/invite เก็บ plaintext ใน DB | เก็บ sha256 แทน (token เก่าที่ค้างจะใช้ไม่ได้) |
| Low | TenantMatchGuard ไม่เคยทำงาน (global guard รันก่อน JWT) | defense-in-depth — ย้ายไปตรวจหลัง auth |
| Low | LINE link code แค่ 24 bit, limiter อยู่ใน memory | เพิ่มความยาว + limiter รวม |

## PDPA — สิ่งที่โค้ดแก้ไม่ได้อย่างเดียว (ต้องทำก่อนขาย)

1. **Privacy notice** บนเว็บ, portal ลูกความ และแอป (ตอนนี้ไม่มีเลย)
2. **บันทึกความยินยอม** (ใคร/เมื่อไร/version) ตอนรับเชิญ portal, ผูก LINE, สมัครสำนักงาน (ToS + DPA)
3. **สัญญาประมวลผลข้อมูล (DPA)** กับสำนักงานลูกค้า + **รายชื่อผู้ประมวลผลช่วง**: OpenAI (US), LINE, Expo/Apple/Google (push), Microsoft, SendGrid/Resend, Omise, Google Maps, iApp, AWS — ระบุการส่งข้อมูลไปต่างประเทศ (ม.28–29) รวมถึงภาพเอกสาร/ใบเสร็จที่ส่ง OCR ไป OpenAI แบบ redact ไม่ได้
4. **สิทธิเจ้าของข้อมูล**: export ข้อมูลลูกความ, ทำให้ไม่ระบุตัวตน (anonymize) — ยังไม่มี endpoint
5. **ระยะเวลาเก็บ**: ตอนนี้เก็บทุกอย่างตลอดไป (ยกเว้นแจ้งเตือน 90 วัน) — กำหนดนโยบาย + cron ลบ session/token หมดอายุ, คดีที่ลบไปแล้ว
6. **แจ้งเหตุละเมิด 72 ชม.**: ไม่มี runbook / บันทึกเหตุ — ต้องมีขั้นตอน (และตรวจ AuditLog ของ prod ว่าเคยมีการใช้ช่องโหว่ `/users` หรือไม่)
7. **ข้อมูลอ่อนไหว (ม.26)**: การแจ้งลาป่วยส่งถึงทุกคนในสำนักงาน (ข้อมูลสุขภาพ) — เสนอให้ทีมเห็นแค่ "ลา" ส่วนประเภทลาเห็นเฉพาะ owner; push/LINE มีชื่อคู่ความและข้อความลูกความเต็ม ๆ แสดงบนหน้าจอล็อก — เสนอย่อเหลือเลขคดี
8. บังคับ MFA สำหรับ OWNER, audit log การ "อ่าน" ข้อมูลฝั่ง staff

## ก่อน deploy

- ตั้ง env **`PLATFORM_ADMIN_EMAILS`** (อีเมลผู้ดูแลระบบ คั่นด้วย ,) ไม่ตั้ง = ไม่มีใครแก้ศาล/วันหยุด/กฎกำหนดระยะเวลาได้
- ยืนยันว่า prod มี `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_PORTAL_JWT_SECRET` (ไม่มีจะ start ไม่ขึ้น)
- พฤติกรรมที่เปลี่ยน: ลบ user ผ่าน `/users` ไม่ได้แล้ว; เชิญคนที่มีบัญชีอยู่แล้วต้องใส่รหัสผ่านเดิม; ASSISTANT/LAWYER สร้างลิงก์ portal ไม่ได้; login ผิดเกิน 10 ครั้ง/นาที/IP ได้ 429
