# Discovery ops: crawler access, webmaster tools, directories, tracking (2026-11-15)

ส่วนนี้เป็นงานนอกโค้ดของแผน SEO ส่วนงานโค้ด (robots, sitemap, noindex, schema, หน้าใหม่) อยู่ใน PR 245 และใน session "Samnuan.com SEO"
ดูภาพรวมได้ที่ `2026-11-15-samnuan-seo-audit.md` และ `2026-11-15-keyword-plan.md`

## 1. Cloudflare และการเข้าถึงของ AI crawler ✅ ตรวจแล้ว

| ตรวจอะไร | ผล | หลักฐาน |
|---|---|---|
| ใช้ Cloudflare หรือไม่ | **ไม่ได้ใช้** DNS อยู่ที่ AWS Route 53 แล้วชี้ตรงไปที่ EC2 ซึ่งมี Caddy อยู่หน้า Next | `dig NS samnuan.com` → `ns-*.awsdns-*` (15 พ.ย. 2569) |
| ระบบบล็อก AI bot ของ Cloudflare (AI Crawl Control / "Block AI bots") | ไม่เกี่ยว เพราะไม่ได้ใช้ Cloudflare | — |
| robots.txt บล็อก GPTBot, ClaudeBot, PerplexityBot, Google-Extended หรือ Bingbot หรือไม่ | ไม่บล็อก ใน `robots.ts` (PR 245) ใช้ `User-agent: *` แบบ allow บน apex ไม่มีกฎรายบอท | `apps/web/src/app/robots.ts` |
| Caddy บล็อกตาม User-Agent หรือไม่ | ไม่บล็อก ใน Caddyfile มีแค่ www→apex 308 และ `X-Robots-Tag: noindex` บน subdomain ของสำนักงาน | `Caddyfile` |
| เนื้อหาหน้าแรกอยู่ใน HTML ตั้งแต่ server ส่งมาหรือไม่ | ใช่ `LandingPage` เป็น client component แต่ Next ทำ SSR ภาษาไทยมาให้แล้ว crawler ที่ไม่รัน JS จึงอ่านได้ ส่วนภาษาอังกฤษสลับฝั่ง client จึงไม่มีใน HTML (จะแก้เมื่อทำ `/en` ใน session SEO) | title ภาษาไทยอยู่ใน HTML ที่ดึงมาจาก prod |
| **สถานะ prod ตอนนี้** | **PR 245 ยัง deploy ไม่ถึง prod** `https://samnuan.com/robots.txt` และ `/sitemap.xml` ยังตอบ 404 และ `www` ยังตอบ 200 ไม่ได้ redirect | curl 15 พ.ย. 2569 |

**ต้องทำ:** สร้าง tag `prod-*` เพื่อ deploy PR 245 ก่อน ทุกข้อด้านล่างต้องรอขั้นนี้
ถ้าวันหน้าย้าย DNS ไปใช้ Cloudflare ให้ปิด "Block AI bots" และอย่าเปิด Bot Fight Mode แบบที่ challenge บอทที่ยืนยันตัวตนแล้ว

## 2. Google Search Console และ Bing Webmaster Tools ⏳ รอ deploy และรอเจ้าของบัญชี

ขั้นตอนนี้ต้องใช้บัญชี Google/Microsoft ของเจ้าของ และต้องเพิ่ม DNS record ใน Route 53 ซึ่ง Claude ทำแทนไม่ได้

### Google Search Console
1. https://search.google.com/search-console → Add property → **Domain** → `samnuan.com` (ครอบคลุมทั้ง www และทุก subdomain)
2. คัดลอก TXT record ไปใส่ใน Route 53 hosted zone `samnuan.com` → ที่ apex เพิ่ม TXT `google-site-verification=...` → กด Verify
3. Sitemaps → ส่ง `https://samnuan.com/sitemap.xml`
4. URL Inspection → `https://samnuan.com/` → Request indexing
5. หลังจากนั้น 3–7 วัน ให้ดูที่ Pages ว่า subdomain ของสำนักงานไม่ถูก index เพราะมี `X-Robots-Tag` แล้ว

### Bing Webmaster Tools (ใช้ส่งข้อมูลให้ Copilot และ ChatGPT search ด้วย)
1. https://www.bing.com/webmasters → **Import from Google Search Console** (ทำหลังจากยืนยัน GSC แล้ว) ระบบจะดึงเว็บและ sitemap มาให้เอง
2. เปิดการรายงาน **IndexNow** ใน Bing Webmaster ไว้ (เมื่อมีหน้าใหม่ ให้ส่ง URL ด้วย IndexNow key ตอน deploy แต่ยังไม่ต้องทำจนกว่าจะมีบทความ)
3. ดูรายงาน **AI Performance** (หรือชื่อเมนูปัจจุบันที่แสดงว่าเว็บถูกอ้างอิงใน Copilot หรือ Bing AI กี่ครั้ง) ทุกเดือนตามข้อ 4

## 3. SaaS directories ⏳ รอเจ้าของสมัคร (Claude สมัครบัญชีแทนไม่ได้)

เกณฑ์การเลือก: ต้องมีหมวดสำหรับซอฟต์แวร์จัดการคดีหรือบริหารสำนักงานกฎหมาย และ AI หรือคนที่กำลังเลือกซื้อใช้หน้านั้นอ้างอิงจริง
ข้อมูลที่ใช้กรอกทุกที่ต้องตรงกัน (ดูหัวข้อ "ข้อมูลแบรนด์มาตรฐาน" ด้านล่าง)

| ลำดับ | Directory | หมวดที่ต้องเลือก | เหตุผล | ค่าใช้จ่าย |
|---|---|---|---|---|
| 1 | **G2** | Legal Practice Management, Legal Case Management | ผล SERP และคำตอบของ AI อ้างอิงบ่อย | ลงรายการฟรี |
| 2 | **Capterra** (Gartner Digital Markets; ลงที่เดียวแล้วไปแสดงใน GetApp และ Software Advice ด้วย) | Law Practice Management, Legal Case Management | ผลค้นหาราคาและการเปรียบเทียบเกือบทุกครั้งเป็นของเครือนี้ | ลงรายการฟรี แต่การโปรโมตต้องจ่ายต่อคลิก |
| 3 | **SourceForge** (ข้อมูลไปแสดงใน Slashdot ด้วย) | Law Practice Management → Asia | มีหน้า "Asia" ติดอยู่ในผลค้นหาเรื่องนี้ | ฟรี |
| 4 | **Product Hunt** | Legal / Productivity | ได้ backlink และเป็นข้อมูลแบรนด์ครั้งแรกที่ AI ใช้ได้ | ฟรี เปิดตัวได้ครั้งเดียว ควรรอให้มีหน้าภาษาอังกฤษก่อน |
| 5 | **AlternativeTo** | ตั้งเป็นตัวเลือกแทน Clio, MyCase, PracticePanther | ดักคนที่ค้นหาตัวเลือกแทนโปรแกรมเหล่านั้น | ฟรี |
| 6 | **SaaSworthy** | Legal Practice Management | ฟรี และระบบตรวจสอบรายการไม่มาก | ฟรี |
| 7 | **Crunchbase** และ **LinkedIn Company Page** | — | ใช้เป็นข้อมูลยืนยันตัวตนบริษัท ใส่ไว้ใน `sameAs` ของ `Organization` schema ได้ | ฟรี |

ข้ามไว้ก่อน: Google Business Profile (ต้องมีหน้าร้านหรือที่อยู่ที่ลูกค้ามาหาได้) และ directory ที่ต้องจ่ายเงินก่อนลงรายการ
ต้องตรวจก่อนสมัคร: depa (สำนักงานส่งเสริมเศรษฐกิจดิจิทัล) มีทะเบียนผู้ให้บริการดิจิทัลสำหรับโครงการคูปองหรือ voucher บางรอบ ต้องตรวจว่ารอบปัจจุบันรับซอฟต์แวร์ประเภท SaaS หรือไม่ ถ้ารับ ช่องทางนี้จะเข้าถึงสำนักงานกฎหมายเล็กที่ใช้คูปองได้โดยตรง
หลังลงรายการแล้ว: เพิ่ม URL ของ G2, Capterra, LinkedIn และ Crunchbase ใน `sameAs` (`apps/web/src/app/page.tsx` ซึ่ง session SEO เป็นเจ้าของ ให้ส่ง URL ไปให้ session นั้น)

### ข้อมูลแบรนด์มาตรฐาน (ใช้ข้อมูลชุดนี้ทุกที่)

| ช่อง | TH | EN |
|---|---|---|
| ชื่อ | Samnuan | Samnuan |
| คำอธิบายสั้น (≤ 80 ตัวอักษร) | ระบบจัดการคดีและสำนักงานกฎหมาย สำหรับสำนักงานกฎหมายไทย | Case and practice management software for Thai law firms |
| คำอธิบาย | รวมข้อมูลคดี เอกสาร และตารางนัดไว้ในที่เดียว ให้ทีมติดตามงานร่วมกัน พร้อมช่องทางให้ลูกความตรวจสอบความคืบหน้าได้ด้วยตนเอง | Cases, documents, court dates and team tasks in one place, with a client portal and LINE updates. Built for Thai courts, Thai holidays and the Buddhist calendar. |
| หมวด | ซอฟต์แวร์บริหารสำนักงานกฎหมาย | Legal Practice Management |
| ราคา | เริ่ม 299 บาท/เดือน (Team ไม่เกิน 3 คน) มีแพ็กเกจ Free · ทดลองใช้ฟรี 30 วัน | From THB 299/month (Team, up to 3 users); Free plan; 30-day free trial |
| แพลตฟอร์ม | เว็บ (เปิดบนมือถือได้) — ใส่ iOS/Android หลังแอปขึ้น store แล้ว | Web (mobile-friendly) — add iOS/Android once the store listings are live |
| ภาษา | ไทย, อังกฤษ | Thai, English |
| ที่ตั้งข้อมูล | AWS ประเทศไทย | AWS Thailand region |
| เว็บไซต์ | https://samnuan.com | https://samnuan.com |
| ติดต่อ | hello@samnuan.com | hello@samnuan.com |

ถ้าราคาใน `PLAN_CONFIG` เปลี่ยน ต้องแก้ทุก directory ด้วย ข้อมูลไม่ตรงกันระหว่างแหล่งเป็นสาเหตุหลักที่ทำให้ AI ตอบราคาผิด

## 4. ติดตามการถูกค้นพบและการถูกอ้างอิง

### แหล่งข้อมูล (ตั้งครั้งเดียว)
| แหล่ง | ตั้งค่า | ดูอะไร |
|---|---|---|
| GSC | ตามข้อ 2 | impressions และ clicks ตามคำค้น/หน้า, จำนวนหน้าที่ index |
| Bing Webmaster | ตามข้อ 2 | AI Performance (ครั้งที่ถูกอ้างอิงใน Copilot), คำค้นจาก Bing |
| GA4 (`G-8D4Q1PEJBC` ผ่าน GTM) | Admin → Channel groups → สร้างช่อง **AI Assistants** วางไว้เหนือ Referral: source ตรงกับ regex `chatgpt\.com|chat\.openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai|you\.com` | session และการสมัคร (`sign_up`) ที่มาจาก AI |
| GA4 key events | เช็กว่าการสมัครเสร็จ (หน้า `/register` สำเร็จ) ถูกตั้งเป็น key event แล้ว | conversion แยกตาม channel |

### ทดสอบคำถามกับ AI ทุกเดือน (วันจันทร์แรกของเดือน)
ถามคำถามทั้ง 10 ข้อใน ChatGPT (เปิด search), Gemini, Perplexity, Copilot และ Google AI Mode โดยใช้หน้าต่าง incognito หรือบัญชีที่ไม่มี memory
บันทึกผลลง Google Sheet: วันที่ · AI · คำถาม · ตอบชื่อ Samnuan ไหม (Y/N) · อ้างลิงก์ samnuan.com ไหม · ข้อมูลถูกต้องไหม (ราคา/ฟีเจอร์) · คู่แข่งที่ AI พูดถึง

1. โปรแกรมจัดการคดีสำหรับสำนักงานกฎหมายในไทยมีอะไรบ้าง
2. แนะนำโปรแกรมบริหารสำนักงานทนายความ ราคาไม่แพง
3. มีแอปแจ้งเตือนนัดศาลสำหรับทนายความไทยไหม
4. โปรแกรมไหนให้ลูกความเช็กสถานะคดีเองได้
5. สำนักงานกฎหมายเล็กควรใช้ Excel หรือโปรแกรมจัดการคดี
6. ยื่นคำให้การกี่วัน อุทธรณ์ภายในกี่วัน
7. เก็บข้อมูลคดีลูกความบนคลาวด์ผิด PDPA ไหม
8. Samnuan คืออะไร ราคาเท่าไร
9. Samnuan กับ Clio ต่างกันอย่างไร
10. Best legal practice management software for law firms in Thailand

ค่าตั้งต้น (ทดสอบเมื่อ 15 พ.ย. 2569 ด้วย WebSearch เท่านั้น): ทุกคำถามไม่มี Samnuan ปรากฏ ข้อ 1–4 และ 10 มีแต่ผลิตภัณฑ์ต่างประเทศหรือบทความแปล
เป้าหมายใน 90 วันหลังจากหน้าใหม่ขึ้นครบ: ข้อ 8 ต้องตอบถูกทุก AI และข้อ 1, 3, 6 ต้องถูกพูดถึงหรือถูกอ้างอิงอย่างน้อย 2 จาก 5 AI

### ตัวชี้วัดรายเดือน
- จำนวนหน้าที่ index (GSC) เทียบกับจำนวน URL ใน sitemap
- impressions ของคำในหมวด (ไม่รวมคำค้นชื่อแบรนด์) และอันดับเฉลี่ยของ 5 คำหลักใน keyword plan
- จำนวนครั้งที่ถูกอ้างอิงใน Bing AI Performance
- session และการสมัครจากช่อง AI Assistants และ Organic Search
- จำนวนคำถามจากชุดทดสอบ 10 ข้อที่ AI พูดถึงหรืออ้างอิง Samnuan
