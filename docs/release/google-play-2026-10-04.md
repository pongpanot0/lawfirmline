# Samnuan: เตรียมส่ง Google Play

สถานะก่อนส่ง PR วันที่ 4 ตุลาคม 2569: เพิ่มโค้ดในเครื่องแล้ว ยังไม่ได้ deploy API/เว็บ สร้าง native `.aab` อัปโหลด Play Console หรือผ่านการตรวจจาก Google ผู้ใช้อนุมัติเปิด PR, merge/push main ล่าสุด และสร้าง APK ด้วย application ID ใหม่เพื่อทดลอง ขั้นตอนเหล่านี้ไม่ใช่การส่งขึ้น Google Play

## บัญชีบุคคลของเจ้าของแอป

- ถ้าสร้างบัญชีหลัง **13 พฤศจิกายน 2023** ต้องทำ **Closed testing อย่างน้อย 12 คนที่ opt-in ต่อเนื่อง 14 วัน** แล้วขอ Production access พร้อมตอบคำถามการทดสอบ การครบจำนวนและวันไม่ได้ทำให้ Google อนุมัติอัตโนมัติ
- ถ้าสร้างก่อนวันนั้น ให้ดูข้อกำหนดที่ Dashboard ของบัญชีจริง ไม่เหมารวมว่าบัญชีบุคคลทุกบัญชีต้องผ่านขั้นตอนนี้
- Internal testing ใช้ทดสอบเบื้องต้น แต่ไม่นับแทน Closed testing ตามเงื่อนไขข้างต้น
- ทำรายการยืนยันตัวตนและอุปกรณ์ที่ Play Console แสดงให้ครบ

อ้างอิง: [Google: Personal account testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

## ระบบบัญชีที่เพิ่ม

| เส้นทาง | พฤติกรรม |
| --- | --- |
| Mobile → เข้าสู่ระบบ → สมัครบัญชี | เรียก `POST /auth/register` เดิม สร้างบัญชีเจ้าของและสำนักงานใหม่ ทดลอง 30 วัน |
| Mobile → ลืมรหัสผ่าน | เรียก `POST /auth/forgot-password` เดิม ไม่เปิดเผยว่าอีเมลใดมีบัญชี |
| Mobile → เพิ่มเติม / ตั้งค่า → บัญชีของฉัน | แก้ชื่อ เปลี่ยนรหัสผ่าน และเริ่มคำขอลบบัญชี |
| เว็บ `/privacy` | หน้า Privacy Policy สาธารณะ |
| เว็บ `/delete-account` | ยืนยันอีเมล/รหัสผ่าน รองรับ MFA แล้วส่งคำขอลบโดยไม่ต้องติดตั้งแอป |

พนักงานสำนักงานเดิมต้องเข้าผ่านการเชิญ การสมัครใหม่ไม่ได้เพิ่มตัวเองเข้าองค์กรเดิม และไม่ได้สร้างระบบ identity แยกจาก backend เดิม

API ใหม่ทุกเส้นทางใช้ JWT ของผู้ใช้เอง ไม่มี `userId` หรือ `firmId` จาก body สำหรับเลือกบัญชีคนอื่น:

| API | Body / ผลลัพธ์ |
| --- | --- |
| `PATCH /auth/account/profile` | `{ firstName, lastName }` แก้เฉพาะชื่อ global identity ของผู้ใช้เอง |
| `POST /auth/account/password` | `{ currentPassword, password }` ตรวจรหัสเดิม เปลี่ยนแบบตรวจ hash เดิมใน transaction และ revoke refresh sessions ของบัญชีนี้ |
| `GET /auth/account/deletion-request` | `null` หรือ `{ id, requestedAt, status: "PENDING_REVIEW" }` ของผู้ใช้เองทุกสำนักงาน |
| `POST /auth/account/deletion-request` | `{ currentPassword }` ตรวจรหัสเดิมก่อนบันทึกคำขอ และคืนคำขอเดิมถ้ามี |

รหัสผ่านใหม่ในหน้าบัญชีและ Mobile signup อย่างน้อย 8 ตัวอักษร และไม่เกิน 72 UTF-8 bytes ตามขีดจำกัด bcrypt ภาษาไทยและ emoji ใช้หลาย bytes ต่อหนึ่งตัวอักษร การเปลี่ยนรหัสผ่านไม่ได้เพิกถอน access JWT ที่ออกไปแล้วทันที; access token เดิมยังอยู่จนหมดอายุตามกลไกปัจจุบัน ส่วน refresh sessions ถูกเพิกถอน และ Mobile ออกจากระบบหลังเปลี่ยนสำเร็จ

## งานที่ต้องเสร็จก่อนส่งตรวจ

1. Deploy API และเว็บชุดนี้ก่อนใช้ Mobile build ที่ชี้ `https://api.samnuan.com` ทดสอบสมัคร/เข้าสู่ระบบ/เปลี่ยนชื่อ/เปลี่ยนรหัสผ่าน/ขอลบบัญชีบน production ด้วยข้อมูลทดสอบ
2. เปิด URL ต่อไปนี้จากเครือข่ายนอกสำนักงานและ browser ที่ไม่ล็อกอิน: `https://samnuan.com/privacy` และ `https://samnuan.com/delete-account` โค้ดที่เพิ่มไม่ได้พิสูจน์ว่า production URL เปิดได้แล้ว
3. เจ้าของบริการตรวจความถูกต้องของ Privacy Policy โดยเฉพาะผู้รับผิดชอบข้อมูล ผู้ให้บริการที่ใช้งานจริง การวัดผล และประเภท/ระยะเวลาเก็บข้อมูลหลังคำขอลบ ก่อนเผยแพร่ นโยบายตอนนี้ยังไม่ได้ระบุระยะเวลาเก็บคงที่ที่เจ้าของบริการรับรอง
4. กำหนดผู้รับผิดชอบคำขอลบ และยืนยันว่า `hello@samnuan.co` รับและติดตามคำขอจริง การบันทึกคำขอไม่ใช่การลบข้อมูลสำเร็จ และยังไม่มีระบบแจ้งเจ้าหน้าที่หรือหน้าคิวสำหรับเจ้าหน้าที่ในชุดนี้
5. เตรียมบัญชี reviewer แยกในสำนักงานทดสอบ ไม่มีข้อมูลคดีจริง เข้าถึงฟังก์ชันที่ต้องตรวจได้ และกรอก App access ด้วยคำแนะนำภาษาอังกฤษ บัญชีควรใช้ซ้ำได้และเข้าจากต่างประเทศได้ หาก reviewer ใช้ MFA ต้องมีวิธีเข้าที่ทำได้ตลอดการตรวจ; ห้ามเพิ่มรหัสผ่านข้ามการยืนยันตัวตนให้ทุกคน
6. กรอก Data safety จากพฤติกรรม native build และ backend จริง: ข้อมูลบัญชี/อีเมล ข้อมูลเอกสารที่อัปโหลด token อุปกรณ์แจ้งเตือน และการวินิจฉัย/SDK ที่ใช้งานจริง การติดตั้ง library อย่างเดียวไม่พิสูจน์การเก็บหรือแบ่งปันข้อมูลแต่ละประเภท
7. เตรียมชื่อแอป คำอธิบาย ไอคอน ภาพโปรโมต screenshot จากแอปจริง อีเมล support, content rating, กลุ่มอายุ, และการประกาศโฆษณาตามพฤติกรรมจริง แอปยังไม่ได้เปลี่ยน launcher icon ในชุดงานนี้; ใช้แบรนด์ Balance ที่อนุมัติแล้วทำ asset สำหรับ store/build
8. ตรวจ native `.aab` จริงว่า target **Android 16 / API 36 ขึ้นไป** ตามข้อกำหนด new apps/updates ตั้งแต่ 31 สิงหาคม 2026 รวมถึง permission และ package `com.samnuan.app` ให้ตรงกับรายการใน Console ผู้ใช้ขอเปลี่ยน Android application ID จาก `co.lexflow.mobile` เป็น `com.samnuan.app` จึงเป็นแอปแยกจาก APK package เดิม และไม่ได้ย้ายบัญชี/ข้อมูลในเครื่องเก่าอัตโนมัติ iOS bundle identifier ยังใช้ค่าเดิม

อ้างอิง: [Google: Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [Google: App access](https://support.google.com/googleplay/android-developer/answer/15748846?hl=en-en), [Google: Target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-EN)

## รับและดำเนินการคำขอลบจริง

ปัจจุบันคำขออยู่ใน `AuditLog` action `ACCOUNT_DELETION_REQUESTED` พร้อม user/firm และ metadata scope `GLOBAL_ACCOUNT_AND_ASSOCIATED_PERSONAL_DATA` ไม่มี migration ใหม่ ไม่มีการลบ User หรือถอนสมาชิกอัตโนมัติ

ผู้ดูแลที่มีสิทธิ์ฐานข้อมูลดูรายการได้ด้วย **read-only** query นี้ ต้องเปิดผ่านช่องทางดูแลที่ได้รับอนุญาต และไม่ส่งข้อมูลบัญชีไปพื้นที่สาธารณะ:

```sql
SELECT a.id, a."createdAt", a."userId", a."firmId", u.email, a.metadata
FROM "AuditLog" a
LEFT JOIN "User" u ON u.id = a."userId"
WHERE a.action = 'ACCOUNT_DELETION_REQUESTED'
ORDER BY a."createdAt" ASC;
```

ขั้นตอนการดำเนินการของผู้รับผิดชอบ:

1. ตรวจคำขอและยืนยันเจ้าของด้วยช่องทางอีเมลบัญชีหรือการยืนยันในระบบ ไม่ขอให้ส่งรหัสผ่าน
2. ตรวจสมาชิกทุกสำนักงาน เซสชัน push devices token ตั้งรหัสผ่าน/MFA โปรไฟล์ และข้อมูลส่วนบุคคลที่เกี่ยวข้อง รวมถึงข้อมูลในไฟล์และสำเนาสำรอง
3. แยกข้อมูลส่วนบุคคลที่ต้องลบ/ทำให้ระบุตัวไม่ได้ กับเอกสารสำนักงานที่มีเหตุผลต้องเก็บตามหน้าที่จริง ส่งต่องานก่อนดำเนินการ ห้ามใช้ API ถอนสมาชิกแทนการลบบัญชี global
4. แจ้งผู้ขอเรื่องประเภท เหตุผล และระยะเวลาเก็บที่รับรองแล้ว ดำเนินการลบ/ทำให้ข้อมูลระบุตัวไม่ได้ตามรายการที่ตรวจ โดยมีหลักฐานและการเพิกถอนการเข้าถึง
5. แจ้งผลและข้อมูลที่ยังเก็บต่อให้ผู้ขอ แล้วเก็บหลักฐานปิดคำขอผ่านระบบงานของทีมดูแล หน้า API ปัจจุบันไม่มีกระบวนการปิดคำขอให้เจ้าหน้าที่ และจะไม่อ้างว่าเพียงส่งคำขอแล้วบัญชีถูกลบ

ควรทดสอบคำขอหนึ่งรายการจนปิดงานได้จริงก่อนประกาศว่าระบบพร้อมรับคำขอลบ การลบสำนักงานจะ cascade ลบ AuditLog ด้วย จึงต้องเก็บหลักฐานคำขอในระบบดูแลก่อนลบสำนักงานที่เกี่ยวข้อง

## สร้างไฟล์และอัปโหลด

รันจาก `apps/mobile` หลัง deploy และตรวจงานข้างต้น ใช้บัญชี Expo/EAS ที่มีสิทธิ์ใน project เดิม:

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile production
```

`eas.json` production ถูกกำหนดเป็น `app-bundle` และเพิ่ม versionCode อัตโนมัติ ให้ดาวน์โหลด `.aab` จาก build ที่สำเร็จ แล้วสร้าง/เปิดรายการแอป Samnuan ใน Play Console และอัปโหลดไป **Internal testing** ก่อน ใช้ **Closed testing** สำหรับเงื่อนไขบัญชีบุคคลใหม่

หากใช้ service account ที่กำหนดสิทธิ์ใน Console และตั้งไว้ใน EAS แล้ว อัปโหลดอัตโนมัติได้:

```sh
npx eas-cli@latest submit --platform android --profile production
```

submit profile นี้ใช้ `track: internal`, `releaseStatus: draft` การอัปโหลดสำเร็จยังไม่เท่ากับปล่อยให้ผู้ทดสอบหรือผู้ใช้ทั่วไป ต้องจัดการ release และผู้ทดสอบใน Console ต่อ และยังไม่ได้รันคำสั่ง build/submit นี้ในงานปัจจุบัน

อ้างอิง: [Expo: Android submission](https://docs.expo.dev/submit/android/)

## หลักฐานในเครื่อง

- API และ auth tests: 20 tests ผ่านใน 2 suites ใช้ bcrypt จริงกับ Prisma/Tenant mocks ไม่ได้ต่อฐานข้อมูล production
- Mobile checks: `check-account-auth.cjs` และ `check-offline-session.cjs` ผ่าน (MFA ไม่เก็บ session ก่อนยืนยัน, สมัครสำเร็จ/ล้มเหลว, profile/session race, password UTF-8 bounds, offline session regression)
- `tsc --noEmit` ผ่าน Mobile, API และเว็บ
- Shared/Nest production compilation และ Next production build ผ่าน (`CHOKIDAR_USEPOLLING=1` สำหรับข้อจำกัด watcher ในเครื่อง และ output เว็บแยก `.next-verify`)
- `expo export --platform android` สร้าง Hermes bundle ในเครื่องได้ ต้องสร้าง native AAB และทดสอบบน Android จริงต่อ
- Browser ที่ `localhost:3015` เปิด policy และหน้าขอลบบัญชีได้ ทดสอบ wrong password → MFA wrong/correct → reauthentication → receipt ด้วย API จำลองบน `localhost:3001` ไม่ได้สร้างหรือลบบัญชีจริง
- Screenshot `samnuan-account-request-mock.jpg` เป็นใบรับคำขอจำลองเท่านั้น

เกณฑ์ทดสอบ Android ก่อนส่ง: สมัครสำนักงานใหม่ → เข้าหน้างาน → ออกจากระบบ/เข้าสู่ระบบใหม่ → แก้ชื่อ → เปลี่ยนรหัสผ่าน → รหัสเก่าเข้าไม่ได้/รหัสใหม่เข้าได้ → เปิด privacy/web deletion → ส่งคำขอลบและตรวจว่าทีมดูแลได้รับจริง พร้อมทดสอบ account ที่เปิด MFA และการไม่มีเครือข่าย
