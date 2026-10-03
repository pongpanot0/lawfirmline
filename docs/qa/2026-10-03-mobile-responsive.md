# Mobile responsive QA — 3 October 2026

ปรับจาก UI เดิม โดยคงสี การ์ด และแท็บหลัก 5 แท็บ ตรวจ prototype 19 ขนาด และ native iOS Simulator บน iPhone SE รุ่น 3 กับ iPad Pro 11 นิ้ว ทั้งแนวตั้งและแนวนอน ไม่ใช่ผลทดสอบบนเครื่องจริงหรือ production

## จุดที่พบและแก้

| ปัญหา | การแก้ |
| --- | --- |
| แอปปิดการรองรับ iPad และล็อกแนวตั้ง | เปิด `ios.supportsTablet` และใช้ orientation `default` ต้องสร้าง native build ใหม่จึงจะมีผล |
| หน้าและฟอร์มยืดกว้างเกินอ่านสะดวกบน iPad | ใช้ `pageContent` เดิม จำกัดหน้าที่ 1080 pt ฟอร์มที่ 760 pt และ login ที่ 480 pt พร้อมจัดกลาง |
| แถบส่งงาน routine กว้างเกินเนื้อหา | จำกัดส่วนปุ่มด้านในที่ 728 pt พร้อมคงแถบด้านล่างและ safe area |
| หน้าต่างมอบหมายมีเนื้อหาและคำเตือนยาวบนจอเตี้ย | ใช้พื้นที่เลื่อนเดียวสำหรับรายชื่อ ภาระงาน และการยืนยัน พร้อมปุ่มปิดอยู่นอกพื้นที่เลื่อน |
| วันอาทิตย์ของปฏิทินตกไปแถวถัดไป ทำให้เหลือ 6 คอลัมน์บน iPad | ลดความกว้างแต่ละคอลัมน์เป็น 14.28% เพื่อไม่ให้ Yoga ปัดเศษแล้วรวมเกิน 100% ตรวจกลับเป็น 7 คอลัมน์แล้ว |
| เปิดปฏิทินบน iPhone แนวนอนแล้ว modal บังคับแนวตั้ง | ระบุทั้งสี่ orientation ให้ modal เลือกวัน เลือกคน เลือกคดี และมอบหมาย |
| ปฏิทินสูงเกินจอแนวนอน | จำกัด sheet สูง 90% และเลื่อนเฉพาะตารางวัน พร้อมปุ่มปิดที่อยู่คงที่ |
| ปุ่มภายใน sheet ถูก accessibility ของกล่องแม่รวมเป็นชิ้นเดียว | ให้กล่องแม่ไม่รวม children และเพิ่ม role/label/value ให้ปุ่มเลือกวันและการยืนยัน |
| login บนจอเตี้ยไม่มีพื้นที่เลื่อน | เพิ่ม ScrollView โดยคงฟอร์มและการจัดการคีย์บอร์ดเดิม |

## Browser prototype

ทดสอบผ่าน in-app browser ที่ `http://localhost:3018/` ใช้ variant A และสลับ Owner, Senior Lawyer, Lawyer, Assistant ผ่าน UI

| ชุดตรวจ | ขนาด / จำนวน |
| --- | --- |
| Layout เริ่มต้น | 13 ขนาด: 320×568, 375×667, 390×844, 430×932, 681×900, 744×1133, 768×1024, 820×1180, 834×1194, 1024×768, 1194×834, 1366×1024, 1440×900 |
| Home แยก role | 36 รอบ: 9 ขนาด × 4 roles |
| ทุกแท็บ | 100 รอบ: 5 ขนาด × 4 roles × 5 tabs |
| มือถือแนวนอน / หน้าต่างแคบ | 24 รอบ: 568×320, 667×375, 844×390, 932×430, 320×1024, 500×834 × 4 roles |
| Owner เทียบคน → เลือกคน → ฟอร์มงาน | 4 ขนาด: 320, 375, 834, 1194 px |
| Assistant เปิดงาน routine | 8 ขนาด: 320, 375, 430, 744, 834, 1024, 1194, 1366 px |

รวม 185 รอบตรวจ viewport/state ไม่พบ horizontal overflow ในค่าที่บันทึก แท็บยังครบ 5 แท็บ และ footer ของงาน routine อยู่ในกรอบจอทุกขนาดที่ตรวจ คืนค่า viewport ของแท็บ QA หลังจบแล้ว

**ข้อจำกัด:** prototype ยังใช้กรอบโทรศัพท์กว้างประมาณ 382–410 px แม้เปิด viewport ใหญ่ จึงใช้ native iPad ด้านล่างเป็นหลักฐานการแสดงผลเต็มความกว้างของ iPad

## Native iOS Simulator

ใช้ Debug build ของแอปใน workspace นี้ บน iOS 26.5 เชื่อม API local `http://localhost:3001` และข้อมูลตัวอย่างแยกจากผู้ใช้จริงในฐานข้อมูล `lawfirm_ui_20261002`

| อุปกรณ์ | ผลตรวจที่ทำผ่าน UI |
| --- | --- |
| iPhone SE รุ่น 3 — 375×667 / 667×375 pt | Owner home, ภาระงาน, เทียบคน, ฟอร์มเพิ่มงาน, การหมุนจอ และปฏิทินแนวนอน |
| iPad Pro 11 นิ้ว M5 — 834×1210 / 1210×834 pt | Owner home เต็มความกว้างและจัดกลาง, ฟอร์มงาน, เทียบคน, คำเตือนวันลา, sheet มอบหมาย, ปฏิทิน 7 คอลัมน์และเดือน 6 สัปดาห์ |
| iPad — Owner / Assistant | Owner เปิด routine แบบอ่านตามสิทธิ์; Assistant มี checklist, ข้อความไฟล์ PDF ที่ยังขาด, ฟอร์มรายงาน และปุ่มล่างสองปุ่ม |
| iPad — คีย์บอร์ดจริงของ Simulator | เมื่อเปิด software keyboard แล้วโฟกัสช่องรายงาน ฟอร์มเลื่อนช่องที่กรอกขึ้นเหนือคีย์บอร์ดได้ การป้อนข้อความและส่งรายงานไม่ได้ยืนยันในรอบนี้ |
| ปฏิทิน | เลือก 30 พฤศจิกายนบน iPad ได้ และเลือก 31 ตุลาคมผ่าน accessibility บน iPhone แนวนอนได้ ค่าวันที่แสดงในฟอร์มตรงกับวันที่เลือก |

ไม่ได้กดยืนยันมอบหมายหรือส่งคำขอลาในรอบตรวจ layout นี้ การตรวจ save/API workflow อยู่ใน [รายงาน routine เดิม](2026-10-03-mobile-routine-and-owner.md)

### ภาพหลักฐาน

- [iPhone SE แนวตั้ง](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-se-owner-portrait.jpeg)
- [iPhone SE แนวนอน](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-se-owner-landscape.jpeg)
- [iPad Owner แนวตั้ง](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-ipad11-owner-portrait.jpeg)
- [iPad Owner แนวนอน](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-ipad11-owner-landscape.jpeg)
- [ฟอร์มงานบน iPad](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-ipad11-form-landscape.jpeg)
- [ปฏิทิน 7 คอลัมน์บน iPad](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-ipad11-calendar-landscape.jpeg)
- [มอบหมายและคำเตือนวันลาบน iPad](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-ipad11-reassign-landscape.jpeg)
- [Assistant routine บน iPad](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-ipad11-assistant-routine-portrait.jpeg)
- [ปฏิทินบน iPhone แนวนอน](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-se-calendar-landscape.jpeg)
- [ฟอร์มแสดงวันที่ 31 ที่เลือก](/Users/pongpanot_s/.codex/visualizations/2026/10/02/01a0fb4f-64ef-7071-9199-c3f8a2171d7f/native-se-date-selection-landscape.jpeg)

## Automated / build checks

ผ่านบน source สุดท้าย:

```sh
pnpm --filter @lawfirm/mobile typecheck
node apps/mobile/scripts/check-court-workflow.cjs
node apps/mobile/scripts/check-routine-workflow.cjs
pnpm --filter @lawfirm/mobile exec expo export --platform ios --platform android --output-dir /private/tmp/lawfirm-responsive-final-export
git diff --check
```

- Hermes bundle export ผ่านทั้ง iOS และ Android; ไม่ใช่หลักฐาน Android native UI
- Xcode Debug Simulator build ผ่าน (`BUILD SUCCEEDED`) และติดตั้งใช้งานบน SE/iPad ได้
- Generated Info.plist รองรับ device families 1/2 และ orientation ทั้งสี่ ก่อนย้าย generated iOS directory ออกจาก checkout ไป `/private/tmp/lawfirm-responsive-generated-ios-20261003`
- ลบ diagnostic logging หลังตรวจปฏิทิน
- ลบ fixture `e2e-responsive-20261003` ที่สร้างใน local DB แล้ว ตรวจเหลือ users/firms ของ fixture = 0
- ไม่มี commit, push, merge หรือ deploy

## ยังต้องยืนยันก่อน release

- **การปัดตารางปฏิทินบน iPhone แนวนอนจอเตี้ย:** ตารางอยู่ใน ScrollView และมีพื้นที่เนื้อหามากกว่า viewport แต่เครื่องมือ Simulator ไม่ส่ง gesture ให้เลื่อนอย่างเชื่อถือได้ การเลือกวันสุดท้ายผ่าน accessibility ผ่าน ไม่ถือว่าได้ยืนยันการปัดด้วยนิ้ว ต้องตรวจด้วยมือบนเครื่องจริงหรือ Simulator
- iPad mini / 13 นิ้ว, native Split View, ตัวอักษรขนาดใหญ่ และ Android native ยังไม่ได้ทดสอบ; viewport ใกล้เคียงผ่านเฉพาะ prototype
- เครื่องจริงและ production ยังไม่ได้ตรวจ การรองรับ iPad/rotation ต้องใช้ native build ใหม่ ไม่ได้เปิดผ่าน OTA เพียงอย่างเดียว
