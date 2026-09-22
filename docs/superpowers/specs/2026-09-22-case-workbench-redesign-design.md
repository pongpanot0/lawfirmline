# Case Workbench Redesign

วันที่: 22 กันยายน 2569  
ขอบเขต: หน้า `cases/[id]` ของ Samnuan เท่านั้น

## เป้าหมาย

ปรับหน้ารายละเอียดคดีให้ทนายและทีมคดีเปิดแล้วตอบได้ทันทีว่า:

1. คดีนี้อยู่ขั้นตอนไหน ใครรับผิดชอบ และมีข้อกำหนดสำคัญอะไร
2. เรื่องเร่งด่วนที่สุดที่ต้องทำต่อคืออะไร
3. นัดศาล งาน เอกสาร หรือ deadline ใดต้องจัดการก่อน
4. จะเข้าไปทำงานในแต่ละพื้นที่ของคดีได้จากจุดใด

การปรับนี้เป็น visual และ interaction redesign ภายใน route และ component ownership เดิม ไม่เปลี่ยน API, data contract, authentication, permission หรือ business workflow

## ผู้ใช้หลักและน้ำเสียง

- ผู้ใช้หลัก: Owner, Senior Lawyer และ Lawyer ที่รู้บริบทงานคดีอยู่แล้ว
- งานหลัก: สแกนสถานะคดีและเริ่มงานถัดไปโดยใช้เวลาน้อย
- Genre: modern-minimal
- Tone: utilitarian ที่มีน้ำหนักแบบ editorial เล็กน้อย
- Theme: ใช้สี น้ำหนักตัวอักษร และ light/dark tokens เดิมของ Samnuan
- Motion: ใช้เฉพาะ feedback ที่ช่วยสื่อสถานะ ไม่ใช้ decorative reveal

## Macrostructure: Case Workbench

นำหลัก Workbench มาปรับใช้กับหน้าปฏิบัติงาน ไม่ใช้รูป screenshot หรือ browser frame เนื่องจากตัวหน้าคดีคือ work surface จริง

โครงสร้างหลัก:

1. Case identity header
2. Priority signal strip
3. Guarded case-stage control
4. Sticky case navigation
5. Asymmetric work surface: case brief 8 ส่วน / action rail 4 ส่วน
6. Secondary history and communication surfaces

## 1. Case Identity Header

แสดงเฉพาะข้อมูลที่ใช้ยืนยันว่ากำลังทำคดีใด:

- ชื่อคดี
- เลขอ้างอิงสำนักงาน
- ลูกความและผู้ว่าจ้างเมื่อเป็นคนละฝ่าย
- ขั้นตอนคดี สถานะคดี และบทบาทฝ่ายเรา
- ทนายผู้รับผิดชอบ

Primary action เปลี่ยนตามสถานการณ์ แต่รุ่นแรกใช้ action ที่มีอยู่แล้วเท่านั้น เช่น บันทึกผลหลังขึ้นศาล หรือออก Notice เมื่อเข้าเงื่อนไข ห้ามสร้าง action ที่ backend ยังไม่รองรับ

ปุ่มปิดคดีและเก็บเข้าคลังต้องไม่อยู่ร่วมกับ primary action เพราะเป็น action ผลกระทบสูง ให้ย้ายไปบริเวณ secondary controls พร้อมข้อความอธิบายและ confirmation flow เดิม

## 2. Priority Signal Strip

แทน summary cards สี่ใบที่มีน้ำหนักเท่ากันด้วยแถบสัญญาณที่จัดลำดับตามความเร่งด่วน:

- นัดหมายที่จะถึง โดยเฉพาะนัดศาล
- อายุความหรือ deadline ที่ระบุจริง
- งานที่ยังไม่เสร็จและวันกำหนดส่งใกล้ที่สุด
- เอกสารที่จำเป็นแต่ยังขาด

หลักการ:

- ไม่สร้างวันที่หรือระดับความเร่งด่วนจากข้อมูลที่ไม่มี
- เมื่อไม่มีข้อมูล ให้แสดงสถานะว่างที่สั้นและตรง ไม่ใช้สีเตือน
- สี warning/destructive ใช้เมื่อมีข้อมูลสนับสนุนจริง
- Signal ที่กดได้ต้องพาไป tab ที่เกี่ยวข้องผ่านกลไก `selectTab` เดิม

## 3. Guarded Case-stage Control

ขั้นตอนคดียังคงแก้ไขได้ แต่ต้องลดโอกาสกดผิด:

- แสดง current stage เด่นกว่าขั้นที่ผ่านมาและขั้นถัดไป
- รองรับชื่อขั้นตอนภาษาไทยยาวโดยไม่เกิด horizontal overflow
- ระบุให้ชัดว่าการกดคือการเปลี่ยนขั้นตอน ไม่ใช่เพียงตัวบอกสถานะ
- ใช้ handler และ loading state เดิม
- ไม่เพิ่ม confirmation dialog ทุกครั้ง เพราะทำให้ workflow ช้า แต่ต้องให้ focus, disabled และ saving feedback ชัดเจน

## 4. Sticky Case Navigation

Tab navigation อยู่ติดด้านบนของ work surface เมื่อผู้ใช้เลื่อน เพื่อรักษาบริบทและสลับงานได้เร็ว

- ใช้ `CASE_TAB_IDS`, `CASE_TAB_LABELS`, `caseTabHref` และ URL query เดิม
- รองรับ keyboard และ ARIA semantics เดิม
- บนจอเล็กใช้ horizontal scroll ที่เห็น affordance ชัด โดยหน้าไม่ scroll แนวนอนทั้งหน้า
- ปุ่มสรุปเอกสารรวมอยู่ใน utilities zone แยกจาก tab แต่ยังเข้าถึงได้จากแถวเดียวกันบน desktop

## 5. Asymmetric Work Surface

### Main pane

พื้นที่หลักเน้นข้อมูลที่ต้องอ่านและแก้ไขเป็นครั้งคราว:

- ข้อมูลคดี
- ทีมและคู่ความ
- ความเคลื่อนไหวคดี
- ข้อเท็จจริงและผลวิเคราะห์ที่มีแหล่งอ้างอิง

คง form, validation, API calls และ error states เดิมทั้งหมด เปลี่ยนเฉพาะ grouping, typography, spacing และ visual hierarchy

### Action rail

พื้นที่ขวาเน้นสิ่งที่ทำต่อได้ทันที:

- Next actions จากงานค้างจริง
- Checklist รวมงานและเอกสารที่ต้องมี
- นัดหมายถัดไป
- Quick task
- บันทึกย่อ

ลดความซ้ำซ้อนโดยให้รายการงานเต็มอยู่ใน tab งาน ส่วน overview แสดงเฉพาะงานที่ควรทำต่อจำนวนจำกัดและลิงก์ไปดูทั้งหมด Checklist ยังคงเป็น checkable surface แต่ไม่ทำสำเนารายการเดิมหลายชุด

บน mobile ให้ action rail ขึ้นก่อนข้อมูลรายละเอียด เพื่อรองรับการใช้งานระหว่างเดินทางและวันขึ้นศาล

## 6. Court-day Priority

เมื่อนัดถัดไปเป็นนัดศาล หน้า overview ต้องยกนัดนั้นขึ้นเป็น priority signal แรก พร้อมวันเวลาและ action ที่ระบบรองรับอยู่แล้ว

รุ่นนี้ไม่อ้างว่าไฟล์พร้อม offline หากไม่ได้ตรวจ download/open จริง และไม่เพิ่ม offline workflow ใหม่ หากมี court-day feature เดิมจะเพียงเชื่อมทางเข้าให้เห็นง่ายขึ้น

## Visual System

- Font: Inter / Noto Sans Thai เดิม; Trirong ใช้ได้เฉพาะ accent เชิง editorial ที่ไม่ลดความอ่านง่าย
- Colour: ใช้ semantic HSL variables เดิมของแอปผ่าน named page tokens
- Accent: primary blue เดิม ใช้เฉพาะ selected state, focus และ primary action
- Radius: ลดการใช้ rounded card ที่เท่ากันทุกส่วน; ใช้เส้น แบ่งพื้นที่ และ negative space มากขึ้น
- Shadow: เฉพาะ sticky navigation หรือ elevated utility ที่ต้องแยกจากพื้นหลัง
- Heading: roman เท่านั้น ไม่มี italic heading
- Interaction: focus-visible ชัด, disabled/saving/error/success states ต้องคงอยู่
- Reduced motion: ไม่มี spatial motion ที่จำเป็นในรุ่นแรก

## Responsive Behaviour

ต้องตรวจที่ 320, 375, 414 และ 768px รวม desktop ปัจจุบัน

- ไม่มี horizontal overflow ระดับ document
- Header actions wrap โดยข้อความปุ่มไม่แตกสองบรรทัด
- Tab rail scroll ภายในตัวเองบน mobile
- Main pane และ action rail รวมเป็นหนึ่งคอลัมน์ โดย action rail มาก่อน
- Stage control wrap หรือ scroll ภายในพื้นที่ของตัวเองโดยไม่ดันหน้า
- ชื่อคดีและข้อมูลลูกค้าต้อง `overflow-wrap:anywhere` และ `min-width:0`
- Touch target สำคัญไม่น้อยกว่า 44px เมื่อพื้นที่อนุญาต

## Accessibility

- รักษา `tablist`, `tab`, `tabpanel`, `aria-selected`, `aria-controls` และ heading hierarchy
- ทุก interactive element ต้องมี `:focus-visible` ที่มองเห็นได้
- สีไม่เป็นตัวสื่อสถานะเพียงอย่างเดียว
- ปุ่ม icon-only ต้องมี accessible name
- ไม่ใช้ clickable `div`
- ลำดับ DOM บน mobile ต้องสอดคล้องกับลำดับความสำคัญในการใช้งาน

## Files

แก้ไข:

- `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`

เพิ่ม:

- `apps/web/src/app/(dashboard)/cases/[id]/case-detail.module.css`
- `apps/web/src/app/(dashboard)/cases/[id]/tokens.css`

ไม่ลบไฟล์และไม่แก้ global stylesheet หากไม่พบข้อจำเป็นระหว่าง implementation

## การทดสอบ

1. TypeScript: `pnpm --filter web exec tsc --noEmit --incremental false`
2. เปิด route คดีจริงด้วย tenant origin และยืนยันข้อมูลโหลดครบ
3. ตรวจ desktop hierarchy, sticky tabs และทุก tab navigation
4. ตรวจ viewport 320, 375, 414 และ 768px ว่าไม่มี document overflow
5. ตรวจ keyboard focus ของ back link, primary action, stage control, tabs และ quick actions
6. ตรวจ light/dark mode เฉพาะส่วนที่เปลี่ยน
7. ยืนยันว่าการแก้ overview, เพิ่มงาน, เปลี่ยน stage, เปิดปฏิทิน, บันทึก note และเปิด AI analysis ยังเรียก flow เดิม
8. ตรวจ console errors หลัง interaction สำคัญ

## Acceptance Criteria

- ผู้ใช้เห็นชื่อคดี ผู้รับผิดชอบ ขั้นตอน และเรื่องเร่งด่วนโดยไม่ต้องเลื่อน
- นัดศาลหรือ deadline ที่มีจริงมีลำดับสูงกว่าข้อมูลสรุปทั่วไป
- รายการงานและ checklist ไม่แสดงซ้ำแบบเต็มหลายจุดใน overview
- ปุ่มปิดคดีไม่แข่งขันกับ primary work action
- Tabs ยัง deep-link ผ่าน query string และใช้งานด้วย keyboard ได้
- ทุก workflow และข้อมูลเดิมยังเข้าถึงได้
- หน้าไม่ overflow ที่ viewport เป้าหมายทั้งสี่
- TypeScript ผ่าน หรือรายงาน failure ที่มีอยู่เดิมพร้อมหลักฐานว่าไม่เกิดจากงานนี้
- ไม่มีการแก้ไฟล์งานค้างนอกขอบเขต

## Non-goals

- ไม่แก้ API หรือฐานข้อมูล
- ไม่สร้าง court-day/offline subsystem ใหม่
- ไม่เปลี่ยน permission model
- ไม่ย้าย route หรือแยก page component ขนาดใหญ่ในรอบนี้
- ไม่ออกแบบ dashboard, case list หรือหน้า sub-route อื่นใหม่
- ไม่เพิ่ม animation library หรือ dependency
- ไม่สร้างข้อมูลตัวอย่าง metric, deadline หรือนัดหมายที่ไม่มีในระบบ
