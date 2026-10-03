# SOP งานสำนักงาน, Owner และร่างงาน — 3 ตุลาคม 2026

สถานะ: implemented ใน local worktree; ยังไม่ได้ commit หรือ deploy และยังไม่ได้รับรองการใช้งานบนเครื่องจริง

## สิ่งที่เพิ่ม

เพิ่ม default SOP ผ่าน catalog/version/snapshot เดิม ไม่เขียนทับ SOP ที่สำนักงานแก้เอง งานที่มอบหมายเก็บเนื้อหาเป็น snapshot ของรุ่นนั้น มีขั้นตอน แบบบันทึกเปล่า ตัวอย่างสมมติ รายการตรวจ ผลงาน PDF ที่ต้องส่ง และวิธีแจ้งเอกสารขาด เปิดต้นฉบับในแฟ้มคดีจาก task เดิมได้เมื่อผูกคดี

| งานประจำ | ผลงานที่ต้องส่ง | ต้นทางที่ต้องใช้จริง | เมื่อข้อมูลขาด |
| --- | --- | --- | --- |
| รับเรื่องและตรวจเอกสาร | บันทึกรับเรื่องและรายการเอกสาร | ข้อมูลลูกความ เอกสารที่ได้รับ รายการจากผู้ดูแลงาน | ระบุเอกสาร/หน้าที่ขาด ผู้ติดตามและวันติดตาม ห้ามติ๊กว่าครบ |
| เตรียมแฟ้มก่อนนัด | รายการเตรียมแฟ้ม สารบัญ และผู้ถือเอกสาร | นัดจริง รายการจากทนายผู้ไปนัด เอกสารในแฟ้ม | แจ้งผู้ไปนัดให้ตัดสินใจ ห้ามเดาวันนัดหรือทำเครื่องหมายว่าพร้อม |
| บันทึกผลหลังนัด | บันทึกผล ประเด็นที่ต้องทำต่อ ผู้รับผิดชอบและกำหนดส่ง | บันทึก/เอกสารที่ได้จากนัดและคำสั่งผู้ดูแลงาน | แยกสิ่งที่ยืนยันไม่ได้และแจ้งผู้ตรวจ ห้ามเดาผลนัด |
| รายงานความคืบหน้า | ร่างรายงานพร้อมแหล่งข้อมูลและผู้ตรวจ | กิจกรรม เอกสาร และงานล่าสุดในแฟ้ม | แจ้งข้อมูลที่ขาด รอผู้ตรวจยืนยันก่อนส่งลูกความ |
| จัดชุดเบิกค่าใช้จ่าย | รายการค่าใช้จ่ายและหลักฐานที่ตรวจเทียบแล้ว | รายการค่าใช้จ่ายและใบเสร็จจริง | ระบุรายการไม่มีหลักฐาน/ยอดไม่ตรง แจ้งผู้ดูแลงานก่อนส่งตรวจ |

ทั้ง 5 งานเป็นรายการเริ่มต้นที่เลือกจาก flow ของแอป เนื้อหามีข้อมูล DEMO-001 เพื่อดูรูปแบบ **ยังไม่ใช่ต้นฉบับหรือผลงานจริงที่สำนักงานรับรอง** ไม่ใส่กฎกฎหมาย กำหนดเวลาคดี หรือเงื่อนไขเบิกที่ไม่มีหลักฐาน ผู้ดูแลงานแก้แบบบันทึก/ตัวอย่าง/กรณีเอกสารขาดใน playbook editor เดิมได้ ผู้ตรวจในขั้นตอนส่งตรวจยังใช้สิทธิ์เดิมของระบบ

Owner เห็นงานติดขัด ไม่มีผู้รับผิดชอบ เลยกำหนด ครบกำหนดวันนี้ และรอตรวจ ก่อนรายละเอียดทีม รายคนเริ่มแบบย่อและกดขยายได้ ผู้ที่ลาวันนี้หรือยังไม่ตั้งประเภทงานไม่อยู่ในรายชื่อให้พิจารณาด้านบน คิวงาน รายงานล่าสุด นัดและวันลาเป็นข้อมูลประกอบ ไม่แปลงคะแนนเป็นชั่วโมงว่างและยังต้องยืนยันเวลาที่รับงานได้

ร่างข้อความและไฟล์แนบใช้ local storage เดิม เก็บสำเนาไฟล์ใน Documents ก่อนยืนยันว่าเก็บแล้ว แยก firm/user/role จัดลำดับ write ให้ข้อมูลล่าสุดชนะ เรียกกลับจากหน้า วันนี้ ได้ เก็บคำขอสร้างงานเดิมและรหัสงานที่สร้างแล้วก่อนส่งไฟล์ต่อ ไม่มีการส่งร่างอัตโนมัติเมื่อเน็ตกลับมา หากไฟล์ในเครื่องหายจะแจ้งให้แนบใหม่ หากการเก็บร่างล้มเหลวจะแสดงข้อผิดพลาดและลองเก็บข้อความปัจจุบันซ้ำได้

การเปิดแอปเมื่อ API ติดต่อไม่ได้ใช้ข้อมูลบัญชีที่เคยเก็บใน SecureStore และผ่าน biometric gate เดิม ยังคงให้ API ตรวจสิทธิ์ทุก request; เมื่อ API ยืนยัน 401/403 จึงล้าง session ข้อมูลบัญชีผูกกับ refresh token ของ session เพื่อไม่เปิดข้อมูลผู้ใช้เก่าหลังเปลี่ยนบัญชีหรือทำร่างหายหลัง access token ต่ออายุ

## หลักฐานที่ผ่าน

- API regression 7 suites / 112 tests: task/review/routine/catalog/daily operations/access
- Local API integration: 1 test ผ่าน สร้างจริงใน DB, SOP ทั้ง 5, snapshot รุ่น, validation, สิทธิ์ 4 roles, ส่งตรวจ/ตีกลับ และคำขอสร้างซ้ำ
- Runnable mobile checks: draft cold recovery/file bytes, firm/user/role isolation, write order, save/copy failure, missing/foreign file, corrupt record และ creation request recovery
- Offline-session check: cache/session isolation, access-token renewal, คำตอบบัญชีเก่าที่มาหลังสลับ session ไม่เขียนทับบัญชีใหม่, network/503 ระหว่าง refresh ไม่ล้าง session, invalid session ล้างข้อมูล, multipart/PDF ต่ออายุ token และไม่ replay upload เมื่อ network error
- Mobile typecheck, API/web typecheck และ shared build ผ่าน; Hermes export ทั้ง iOS/Android ผ่าน
- API build ผ่านด้วย temporary Nest config ที่ปิด asset watcher; normal build ติด EMFILE ของ watcher ใน sandbox ไม่ได้แก้ config ของ repository
- iPhone SE Simulator: กดขยายรายคน, เห็น SOP ทั้ง 5, พิมพ์ชื่องานและเลือก SOP/ผู้ตรวจ, แนบภาพผ่าน Photo Picker, เห็นสถานะเก็บร่างและสำเนาไฟล์จริงใน Documents
- Reload JavaScript runtime แล้วผ่าน biometric gate: หน้า วันนี้ พบรายการร่าง เปิดกลับมาได้ชื่องาน SOP ผู้ตรวจและภาพเดิม บันทึกงานจากร่างและอัปโหลด JPEG สำเร็จ API ยืนยันมี task เดียว
- Local API: อัปโหลด PDF ตัวอย่างและดาวน์โหลดตรวจ bytes ตรงต้นฉบับผ่าน ใช้ข้อมูลสมมติเท่านั้น
- iPhone SE Simulator: ขยายแบบบันทึกและตัวอย่าง DEMO-001 ใน task ได้ เปิด PDF จากปุ่มผลงานถึง OS share sheet และ Preview ตรวจพบข้อความทั้งสองบรรทัดจาก PDF ตัวอย่างจริง; ยังไม่ใช่หลักฐานเครื่องจริง
- Owner บน iPad Pro 11 Simulator แนวตั้ง/แนวนอน: เนื้อหางานเสี่ยงและการพิจารณาคนอยู่ก่อนรายละเอียดทีม; การตรวจ UI เพิ่มเติมมี system Save Password overlay ที่เครื่องมือปิดได้ไม่เชื่อถือ จึงไม่ถือว่า native PDF viewer หรือทุก gesture ผ่าน
- ล้าง attachment QA ผ่าน API ทั้ง record/bytes แล้ว ล้าง fixture e2e-responsive-20261003 ใน local DB ตรวจเหลือ users/firms ของ fixture = 0 ไม่ล้างบัญชีหรือข้อมูลจริง

ภาพประกอบจาก Simulator:

- [Owner บน SE หลังปรับลำดับ](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/office-owner-se-final.jpeg)
- [รายการ SOP ทั้ง 5](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/office-five-sops-se.jpeg)
- [ร่างที่กู้คืนพร้อมไฟล์](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/office-draft-restored-se.jpeg)
- [PDF ใน Preview](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/office-pdf-preview-se.jpeg)

```sh
node apps/mobile/scripts/check-task-drafts.cjs
node apps/mobile/scripts/check-offline-session.cjs
node apps/mobile/scripts/check-routine-workflow.cjs
node apps/mobile/scripts/check-court-workflow.cjs
pnpm --filter @lawfirm/mobile typecheck
pnpm --filter api exec jest --config jest.config.js --runInBand --watchman=false tasks.service.spec.ts tasks.service.detail.spec.ts task-detail.service.spec.ts practice-setup.service.spec.ts daily-operations.service.spec.ts case-access.service.spec.ts
E2E_API_URL=http://127.0.0.1:3002 pnpm exec playwright test --project=mobile-routine
pnpm --filter @lawfirm/mobile exec expo export --platform ios --platform android --output-dir /private/tmp/lawfirm-office-drafts-final3-export
git diff --check
```

## ยังต้องพิสูจน์บนเครื่องจริงและกับคนใหม่

ไม่พบ iPhone/iPad ที่เชื่อมต่อจาก devicectl; ไม่มี physical-device run ในรอบนี้ Simulator Reload เป็นการเริ่ม JavaScript ใหม่ **ไม่ใช่การ kill OS process** และ API/mocks ไม่ใช่หลักฐาน push delivery หรือ native PDF viewer

| การทดสอบที่ต้องทำ | เกณฑ์ผ่าน |
| --- | --- |
| Camera | ให้/ปฏิเสธสิทธิ์ ถ่ายหลายภาพ ยกเลิกและกลับเข้า task ได้ ภาพถูกแนบกับงานที่เลือก |
| Files/PDF | เลือก PDF จาก On My Device/iCloud ตรวจทุกหน้าและกลับเข้า task ได้ ไฟล์ใหญ่เกินกำหนดมีคำแนะนำ |
| ปิดแอปทั้ง process | หลังขึ้นว่าเก็บร่างแล้ว kill แอปและเปิดใหม่ ข้อความและไฟล์ครบ ตรวจไฟล์ bytes ไม่ใช่แค่ชื่อ |
| ขาดการเชื่อมต่อ | เน็ตหลุดก่อนและระหว่างสร้างงาน/อัปโหลด กู้ร่างได้ ไม่สร้าง task ซ้ำ ระบุไฟล์ที่ส่งแล้ว/เหลือให้ตรวจ |
| Offline cold start | ปิดแอปขณะไม่มีเน็ต เปิด biometric gate และร่างใหม่ในเครื่องได้ งานเดิมที่ต้องโหลด server กลับมาได้หลังเชื่อมต่อ |
| Notifications | ใช้ native build บนเครื่องจริง ตรวจ permission, foreground/background/terminated, แตะเข้า task ที่ถูกต้อง, logout/สลับบัญชีไม่เปิดงานข้ามสิทธิ์ |
| iPad/Android | iPad split view, keyboard, ตัวอักษรใหญ่, native Android และการปัดหน้าจอ ไม่ใช้ export หรือ prototype แทนผลนี้ |

ถ้าการเชื่อมต่อขาดหลัง server รับ attachment แล้วแต่ client ยังไม่ได้รับคำตอบ การ retry ด้วยผู้ใช้อาจแนบไฟล์ซ้ำ ต้องตรวจรายชื่อไฟล์ก่อนส่งซ้ำ การสร้าง task มี idempotency แต่ยังไม่มี idempotency ของ attachment upload

การพิสูจน์คนใหม่: ให้ผู้ที่ไม่ได้รับการสอนทำทั้ง 5 งานด้วยแฟ้มตัวอย่างที่สำนักงานรับรอง มีเอกสารครบ 1 ชุดและขาด 1 ชุดต่อ SOP ผู้ตรวจเทียบผลงานกับตัวอย่างจริง เก็บเวลา จุดที่ต้องถาม และข้อผิดพลาด **ผ่านเมื่อทำและส่งตรวจถูกต้องทั้ง 5 งาน รวมกรณีเอกสารขาด โดยไม่ต้องอธิบายขั้นตอนเพิ่ม** ตอนนี้ยังไม่ได้ทำรอบนี้และยังไม่ได้รับต้นฉบับจริงของสำนักงาน
