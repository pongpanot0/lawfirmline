# SEO Audit — samnuan.com (2026-11-15)

ประเภทธุรกิจ: **SaaS** (มีหน้าราคา, ทดลองใช้ฟรี 30 วัน, สมัคร/เข้าสู่ระบบ) กลุ่มเป้าหมายคือสำนักงานกฎหมายในไทย

## SEO Health Score: **50 / 100**

| หมวด | น้ำหนัก | คะแนน | เหตุผลหลัก |
|---|---|---|---|
| Technical SEO | 22% | 45 | ไม่มี robots.txt, ไม่มี sitemap, ไม่มี canonical, apex กับ www ให้ผลซ้ำกัน |
| Content Quality | 23% | 45 | ทั้งเว็บมีหน้าขายหน้าเดียว (~4.5k ตัวอักษร), ไม่มีบทความ, ไม่มีข้อมูลบริษัทหรือรีวิวลูกค้า |
| On-Page SEO | 20% | 70 | title, description, H1/H2 ดี; หน้า /login กับ /register ใช้ title ซ้ำกับหน้าแรก |
| Schema | 10% | 10 | ไม่มี JSON-LD เลย |
| Performance (CWV) | 10% | 65 | มือถือได้ 81, LCP 3.7 วินาที; ยังไม่มีข้อมูลผู้ใช้จริงใน CrUX |
| AI Search Readiness | 10% | 40 | ไม่บล็อก AI crawler แต่ไม่มีข้อเท็จจริงเชิงโครงสร้าง และค้นชื่อแบรนด์ไม่เจอ |
| Images | 5% | 75 | alt ครบ, รูป hero 2880px, โลโก้ไฟล์ 256px แต่แสดงจริง 36px |

วิธีเก็บข้อมูล: ใช้ curl ยิงไปที่ origin 43.211.26.208 (เครือข่ายออฟฟิศบล็อก samnuan.com), PageSpeed API, CrUX API, WebSearch และอ่านซอร์ส `apps/web`
ข้อจำกัด: ยังไม่มีข้อมูลจาก Search Console (ต้องใช้ service account) จึงยังยืนยันไม่ได้ว่าหน้าไหนถูก index แล้ว

---

## Critical

### C1. ไม่มี `robots.txt` และ `sitemap.xml` (ทั้งคู่ตอบ 404)
- **ที่มา:** ใน `apps/web/src/app/` ไม่มีไฟล์ `robots.ts` และ `sitemap.ts` Google จึงไม่มีรายชื่อ URL ให้ไล่เก็บ
- **ผลกระทบเพิ่ม:** แอปเดียวกันให้บริการ `*.samnuan.com` (subdomain ของแต่ละสำนักงาน ดู `Caddyfile`) ทำให้ subdomain ของลูกค้าอาจถูก index ได้
- **วิธีแก้:** เพิ่ม `app/robots.ts` ที่เช็ก host ถ้าเป็นโดเมนหลักให้ allow และชี้ไป sitemap ถ้าเป็น subdomain ของสำนักงานให้ `Disallow: /` แล้วเพิ่ม `app/sitemap.ts` ที่มี `/`, `/privacy` และหน้าที่จะเพิ่มในอนาคต
- **รู้ได้อย่างไรว่าไม่ได้ผล:** `curl https://samnuan.com/robots.txt` ยังได้ 404 หรือ Search Console รายงานว่าอ่าน sitemap ไม่ได้
- **ตัวชี้วัดที่ดูได้เอง:** จำนวน "Discovered/Indexed" ใน Search Console > Pages

### C2. Host ซ้ำ: `samnuan.com` กับ `www.samnuan.com` ตอบ 200 ด้วย HTML ชุดเดียวกัน และไม่มี canonical
- **ที่มา:** ใน Caddy ทั้ง `{$DOMAIN}` และ `www.{$DOMAIN}` ส่งไปที่ `web:3000` ทั้งคู่โดยไม่ redirect ขณะที่ `og:url` ชี้ไป apex แต่ PageSpeed/Google เข้าผ่าน www
- **วิธีแก้:** เลือก apex (`samnuan.com`) ให้ตรงกับ `metadataBase` แล้วใน Caddy ให้ `www.{$DOMAIN}` ทำ `redir https://{$DOMAIN}{uri} 308` จากนั้นเพิ่ม `alternates: { canonical: '/' }` ใน metadata ของหน้าแรก
- **ต้องทำก่อน:** C1 (sitemap ต้องใช้ host เดียวกัน)
- **รู้ได้อย่างไรว่าไม่ได้ผล:** `curl -I https://www.samnuan.com/` ไม่ได้ 308 หรือ Search Console เลือก canonical เป็น www

## High

### H1. ไม่มี structured data
เพิ่ม JSON-LD ในหน้าแรก ได้แก่ `Organization` (ชื่อ, โลโก้, `sameAs` ไปที่ LINE OA/Facebook) และ `SoftwareApplication` (`applicationCategory: BusinessApplication`, `offers` ตามแพ็กเกจราคาจริง เริ่ม 299 บาท/เดือน, `operatingSystem: Web, iOS, Android`)
ห้ามใส่ `aggregateRating` จนกว่าจะมีรีวิวจริง
**รู้ได้อย่างไรว่าไม่ได้ผล:** Rich Results Test ไม่พบ SoftwareApplication

### H2. หน้า /login และ /register ถูก index ได้ และใช้ title ซ้ำกับหน้าแรก
ใส่ `robots: { index: false }` ให้ /login, /delete-account และ route ใน `(dashboard)`, `(client-portal)`, `superadmin` ส่วน /register ให้ index ได้แต่ตั้ง title ของตัวเอง (เช่น "สมัครใช้ Samnuan ฟรี 30 วัน")

### H3. LCP บนมือถือ 3.7 วินาที (เกณฑ์ ≤ 2.5)
1. Google Fonts `<link>` ใน `layout.tsx:55` บล็อกการแสดงผลประมาณ 780 ms → ย้ายไปใช้ `next/font/google`
2. รูป hero (`LandingPage.tsx:58`) preload แล้วแต่ไม่มี `fetchpriority=high`
3. GTM + GA4 + FB Pixel ทำให้มี JS ที่ไม่ได้ใช้ประมาณ 210 KiB → โหลดหลัง interaction หรือตั้งให้ tag ยิงช้าลงใน GTM

**ตัวชี้วัด:** LCP บนมือถือใน PageSpeed และ CrUX เมื่อทราฟฟิกถึงเกณฑ์

### H4. ค้นชื่อแบรนด์ "Samnuan" แล้วไม่เจอ
WebSearch ทั้งด้วยชื่อแบรนด์และคำในหมวดเดียวกันไม่เจอ samnuan.com เลย ส่วนผลค้นคำว่า "โปรแกรมบริหารสำนักงานกฎหมาย" มีแต่ ClickUp, Bitrix24 และเว็บต่างประเทศ แปลว่าในไทยยังมีพื้นที่ว่างให้แข่ง แต่ตอนนี้ยังไม่มีหน้าที่ตั้งใจจับคำค้นเหล่านี้เลย
**ต้องทำก่อน:** C1, C2 แล้วยืนยันผลใน Search Console

## Medium

- **M1. เนื้อหาบางเกินไปสำหรับคำค้นในหมวดนี้** ควรเพิ่มหน้า (เรียงตามความสำคัญ):
  `/features/court-calendar` (ปฏิทินนัดศาล), `/features/client-portal`, `/features/line-notify`, `/#pricing` (แยกออกจาก anchor), `/about` (ทีมงาน, ติดต่อ, ที่อยู่บริษัท เพื่อเสริม E-E-A-T) และบทความจากโจทย์ที่เจอบ่อย เช่น "วิธีจัดตารางนัดศาลของทีม", "นับระยะเวลาอุทธรณ์"
- **M2. ภาษา EN สลับฝั่ง client บน URL เดียวกัน** ทำให้ Google เห็นแค่ภาษาไทย ถ้าต้องการให้หน้า EN ถูกค้นเจอ ต้องแยก path เป็น `/en` และใส่ `hreflang`
- **M3. ยังไม่มี `llms.txt`** ใส่หรือไม่ใส่ก็ได้ (Google ไม่ได้ใช้ไฟล์นี้) ทำหลังจากเสร็จ H1 และ M1
- **M4. หน้า 404 ใช้ค่าเริ่มต้นของ Next (ภาษาอังกฤษ ไม่มีลิงก์กลับหน้าแรก)** → เพิ่ม `app/not-found.tsx`

## Low

- โลโก้ `samnuan-balance-mark.png` ไฟล์ขนาด 256px แต่แสดงจริง 36px → ส่งออกขนาด 72px หรือใช้ SVG
- ไม่มี web manifest (`manifest.webmanifest` ตอบ 404)
- `<meta property="og:url">` ควรอัปเดตตาม host ที่เลือกในข้อ C2

---

## ลำดับที่แนะนำ

1. **C1 + C2 + H2** (ทำรวมใน PR เดียว ขนาดเล็ก) → deploy → ส่ง sitemap ใน Search Console
2. **H1** schema
3. **H3** ความเร็วบนมือถือ
4. **M1** หน้าฟีเจอร์และ about → **H4** ติดตามอันดับคำค้นใน GSC
5. M2–M4, Low

## ข้อมูลที่ยังขาด
- Search Console: สถานะ index จริง, คำค้นที่มี impression
- GA4: ทราฟฟิก organic
- Backlinks: ยังไม่ได้ตั้งค่า Moz/Bing API
