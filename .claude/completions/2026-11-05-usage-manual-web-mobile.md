# 2026-11-05 — คู่มือการใช้งาน เว็บ + มือถือ (PDF)

ผลลัพธ์: `docs/user-guide/Samnuan-คู่มือการใช้งาน.pdf` (132 หน้า A4 แนวนอน): หน้าปก สารบัญ 3 หน้าพร้อมเลขหน้า ส่วนที่ 1 เว็บ (65 หน้าจอ) ส่วนที่ 2 แอปมือถือ (36 หน้าจอ) และส่วนที่ 3 LINE OA

## สร้างใหม่ยังไง
- เว็บ: `E2E_COURT_EVENT_ID=<id นัดศาล> pnpm e2e:guide` ต้องเปิด web :3005 และ api :3001 ไว้ก่อน และต้องรันเต็มชุด เพราะการรันบางเทสต์จะล้าง `slides.json`
- มือถือ: ภาพจาก iPhone 17 Pro simulator ผ่าน Expo Go 56 โดยใช้ `EXPO_PUBLIC_API_URL=http://localhost:3001` เปิดแต่ละหน้าด้วย `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/<route>"` แล้วถ่ายด้วย `xcrun simctl io booted screenshot` ลง `docs/user-guide/shots/mobile/` ข้อความอยู่ใน `docs/user-guide/mobile-slides.json`
- ซ่อนปุ่ม Tools ของ Expo Go: `xcrun simctl spawn booted defaults write host.exp.Exponent EXDevMenuShowFloatingActionButton -bool NO` (กด toggle ในเมนูแล้วไม่ติด)
- `node e2e/build-deck.mjs && node e2e/build-pdf.mjs` เลขหน้าในสารบัญคำนวณได้เพราะแต่ละ `<section class="slide">` พิมพ์เป็น 1 หน้าพอดี

## สิ่งที่เปลี่ยนในแอปจนสไลด์เดิมใช้ไม่ได้
- เจ้าของสำนักงานเปิด `/dashboard` แล้วถูกพาไป `/operations` จึงเอาสไลด์แดชบอร์ดออก
- สร้างคดีเป็นฟอร์มหน้าเดียวแล้ว ไม่มี wizard สองขั้น สไลด์ 05/06 เดิมจึงรวมเป็น `05-case-new`

## ข้าม (seed ไม่มีข้อมูล หรือหน้าไม่มี)
ห้องทำงานเรื่องรับเข้า, รายละเอียดอีเมลรับเข้า, /research, /admin/users/new, รายละเอียดคดีในพอร์ทัล

DB ที่ใช้ถ่าย: `lawfirm_guide_20261105` บน Postgres ในเครื่องพอร์ต 5432 แยกจาก DB ที่ใช้ร่วมกัน ลบได้เมื่อไม่ใช้แล้ว
