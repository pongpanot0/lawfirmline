# ชุดร่างคอนเทนต์ Samnuan (local)

สำหรับสำนักงานทนายสายคดีความขนาดเล็ก: 12 หัวข้อ หมุนครั้งละ 3 โพสต์ พร้อมการ์ด 1080×1350 และ alt text งานนี้สร้างร่างเท่านั้น **คนตรวจและตั้งเวลาเองใน Meta Business Suite** ไม่มีโค้ดเชื่อมต่อหรือโพสต์โซเชียล

## เตรียมเครื่อง

ใช้ Node 22 ที่ `~/.nvm/versions/node/v22.22.3/bin/node`, Codex CLI ที่ login ไว้แล้ว และ `playwright` ใน node_modules ของ repo ไม่เพิ่ม dependency ไม่สมัครหรือซื้อบริการใด หากเครื่องไม่มี Chromium ของ Playwright ให้ใช้การติดตั้ง browser ตามขั้นตอน Playwright ของ repo ก่อน (ตัว kit ไม่ดาวน์โหลดให้เอง)

ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อโหลด Trirong และ Noto Sans Thai จาก Google Fonts การ render รอโหลดฟอนต์และหยุดหากฟอนต์โหลดไม่ได้หรือข้อความล้น ไม่ย่อหรือซ่อนข้อความเพื่อให้ผ่าน ถ้าสภาพแวดล้อม sandbox ไม่อนุญาตเปิด Chromium ให้รันคำสั่งจาก Terminal ปกติบน Mac

```sh
cp marketing/.env.example marketing/.env
chmod 600 marketing/.env
mkdir -p marketing/out/logs
node marketing/scripts/check.mjs
node marketing/scripts/weekly-draft.mjs --dry-run
node marketing/scripts/check.mjs --render-stress
plutil -lint marketing/launchd/com.samnuan.weekly-draft.plist
```

ตั้ง `RESEND_API_KEY`, `MAIL_FROM` (sender ที่ยืนยันแล้ว), `MAIL_TO` (อีเมลผู้ตรวจหนึ่งคน) ใน `.env` ของ kit เท่านั้น ตัว parser รองรับ `KEY=value`, ค่าครอบ quote, comment เต็มบรรทัด และ comment หลังช่องว่าง ไม่รองรับ interpolation/multiline และ environment ที่มีอยู่มีลำดับก่อน `.env` เก็บ secret ไว้ local ไม่ใส่ใน prompt/log/Git หากไม่มี API key จะไม่ส่งอีเมล แต่ยังสร้างไฟล์และพิมพ์ path

**งบเพิ่ม 0 บาท:** ไม่เพิ่ม SDK/provider หรือบริการเสียเงิน ใช้สิทธิ Codex และ Resend ที่มีอยู่เท่านั้น ตรวจ quota/ค่าใช้จ่ายบัญชีเดิมด้วยตนเองก่อนเปิดงานจริง ถ้าต้องจ่ายเพิ่มให้หยุด automation แล้วใช้ sample เป็นร่างสำหรับคนเขียน ไม่รับประกันว่า Codex/Resend ทุกบัญชีฟรี

## ทำงานประจำสัปดาห์

จันทร์ 09:00 job อ่าน `topics.json` กับ `state.json` (`{"usedIds":[]}` เมื่อยังไม่มี) เลือก 3 หัวข้อแรกที่ยังไม่ใช้ เมื่อหมดจะเริ่มรอบใหม่ รวมกรณีหมดกลางชุด ร่างด้วย `codex exec --ephemeral -s read-only -c model_reasoning_effort="low" --output-schema marketing/schema/posts.schema.json` แบบ stdin ไม่โต้ตอบ timeout 5 นาที/ครั้ง ตัวร่างอยู่ในฟังก์ชัน `draftPosts()` เพียงจุดเดียวสำหรับเปลี่ยน LLM ภายหลัง

ตรวจ schema และกติกา: hook+body รวมไม่เกิน 350 Unicode code points, หัวข้อการ์ด 40, bullet ไม่เกิน 4 ข้อ ข้อละ 45, hashtags ไม่เกิน 3 ไม่ผ่านหรือ Codex ล้มเหลวให้ลองใหม่หนึ่งครั้ง แล้วส่ง error ให้ผู้ตรวจ หากไม่มี key พิมพ์ error/path แทน ตัวตรวจความยาวเป็น code points ตาม JSON Schema รวมสระ/วรรณยุกต์ ไม่ใช่จำนวนตัวอักษรที่เห็นด้วยตา

สร้าง PNG ทั้งสาม, `posts.json` และ `posts.md` ในพื้นที่ชั่วคราวก่อนย้ายเป็น `marketing/out/YYYY-MM-DD/` แล้วจึงบันทึก state แบบ atomic จากนั้นส่งอีเมลพร้อมข้อความและ PNG base64 หากเขียนไฟล์/render ไม่สำเร็จ state ไม่เปลี่ยน หากอีเมลล้มเหลว **ไฟล์และ state ที่บันทึกแล้วจะคงอยู่** ให้เปิดไฟล์ใช้เอง ไม่มี retry อีเมลอัตโนมัติเพื่อลดการส่งซ้ำ โฟลเดอร์วันที่เดิมไม่ถูกเขียนทับ ให้ตรวจชุดเดิมก่อน ไม่ลบเพื่อร่างใหม่โดยไม่จำเป็น

dry-run ใช้ `sample-posts.json` คงที่ที่อ่านได้ใน repo ไม่เรียก Codex ไม่ส่งเมล ไม่เปลี่ยน state ผลอยู่ `marketing/out/dry-run/YYYY-MM-DD/` (รันซ้ำทับเฉพาะ dry-run) stress fixtures/ภาพอยู่ `marketing/out/stress/` และ `wide/` ตัวตรวจเปิดได้ด้วย `node marketing/scripts/check.mjs --render-stress`

ผู้ตรวจเปิดภาพเต็มและย่อประมาณ 360×450 เทียบมือถือ ตรวจความถูกต้อง ภาษา ลิงก์ และ alt text ใน `posts.md` แล้วคัดลอก **เฉพาะข้อความใต้ “ข้อความพร้อมคัดลอก”** เลือก PNG และใส่ alt text ด้วยคนใน Meta Business Suite เวลาที่เสนอ: อังคาร 19:00, พฤหัสบดี 12:00, เสาร์ 10:00 ตาม timezone เครื่อง (ตั้ง Asia/Bangkok) วันเวลาจริงอยู่ในไฟล์ ตรวจ timezone ของ Suite ก่อนกดตั้งเวลา ใช้ข้อมูลสมมติเท่านั้นและบันทึก URL หลังเผยแพร่ด้วยตนเอง

แก้ข้อความแล้ว render ใหม่โดยรักษา JSON ให้ตรง schema:

```sh
node marketing/scripts/render-cards.mjs marketing/sample-posts.json marketing/out/manual-preview
```

เทมเพลตทั้งสามรับ `?data=` ตามด้วย `encodeURIComponent(JSON.stringify({headline,bullets}))` หรือกำหนด `window.__CARD__={headline,bullets}` ก่อน `card.js` ทำงาน ใช้ textContent แสดงข้อมูล ไม่ตีความเป็น HTML

## ตั้งเวลาโพสต์ Facebook อัตโนมัติ (ไม่บังคับ)

ใส่ `FB_PAGE_ID` และ `FB_PAGE_TOKEN` ใน `marketing/.env` แล้ว job วันจันทร์จะ**ตั้งเวลาโพสต์ทั้ง 3 ลงเพจเอง** (รูป + แคปชั่น, อังคาร 19:00 / พฤหัส 12:00 / เสาร์ 10:00) ผ่าน Graph API `/{page-id}/photos` แบบ `published=false` + `scheduled_publish_time` เมลจะบอกว่าตั้งเวลาอะไรไว้ ถ้าไม่ชอบอันไหน ลบหรือแก้ใน Meta Business Suite › Planner ก่อนถึงเวลา ถ้าไม่ใส่ค่า ระบบส่งเมลแบบเดิม (คนตั้งเวลาเอง) ตั้งเวลาไม่สำเร็จรายโพสต์จะแจ้งในเมล ไม่ทำให้ทั้ง job ล้ม ผลเก็บใน `out/YYYY-MM-DD/facebook.json`

ขั้นตอนเอา token (ทำครั้งเดียว ต้องเป็น admin ของเพจ):

1. developers.facebook.com › My Apps › Create App › เลือกใช้งานแบบจัดการเพจ/Business ตั้งชื่อเช่น "Samnuan Marketing" ใช้ **Development mode** ได้เลย (admin ของ app ที่เป็น admin ของเพจด้วย ไม่ต้องส่ง App Review)
2. Tools › Graph API Explorer › เลือก app นี้ › Add permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` › Generate Access Token (ได้ user token อายุสั้น)
3. แปลงเป็น user token อายุยาว (~60 วัน) ใน Terminal เครื่องตัวเอง (ใช้ App ID/App Secret จาก App settings › Basic; อย่าวาง secret ในแชทหรือ commit):
   `curl "https://graph.facebook.com/v27.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_USER_TOKEN"`
4. เอา Page token: `curl "https://graph.facebook.com/v27.0/me/accounts?access_token=LONG_USER_TOKEN"` › หาเพจสำนวน › คัดลอก `id` เป็น `FB_PAGE_ID` และ `access_token` เป็น `FB_PAGE_TOKEN` (Page token ที่ได้จาก long-lived user token ไม่มีวันหมดอายุ จนกว่าจะเปลี่ยนรหัสผ่าน/ถอด admin/ลบ app)
5. ตรวจ: `node marketing/scripts/fb-check.mjs` (อ่านอย่างเดียว) แล้ว `node marketing/scripts/fb-check.mjs --live` (ตั้งเวลาโพสต์ทดสอบ 29 วันข้างหน้าแล้วลบทันที)

อ้างอิง: Meta Pages API › Posts (ตั้งเวลาได้ 10 นาที–30 วันล่วงหน้า), Long-lived tokens (เข้าถึง 2026-11-14)

## ติดตั้ง / หยุด launchd ด้วยตนเอง

**ยังไม่ได้โหลด job ให้** plist มี absolute path สำหรับ checkout และ user นี้ Node คือ `/Users/pongpanot_s/.nvm/versions/node/v22.22.3/bin/node` หากย้าย repo/เครื่อง ให้แก้ ProgramArguments, WorkingDirectory, PATH และ log paths ใน plist ให้ครบก่อนใช้ `command -v codex` ควรอยู่ใน PATH ที่ระบุ ไม่พึ่ง `.zshrc` และสร้าง `marketing/out/logs/` ก่อน bootstrap เสมอ

```sh
mkdir -p marketing/out/logs
plutil -lint marketing/launchd/com.samnuan.weekly-draft.plist
launchctl bootstrap "gui/$(id -u)" "$PWD/marketing/launchd/com.samnuan.weekly-draft.plist"
launchctl print "gui/$(id -u)/com.samnuan.weekly-draft"
```

หยุดและนำ job ออก:

```sh
launchctl bootout "gui/$(id -u)/com.samnuan.weekly-draft"
```

เป็น user LaunchAgent จันทร์ 09:00 ตาม timezone local ต้อง login อยู่ เครื่องหลับอาจทำหลังตื่นตามพฤติกรรม launchd ไม่รับประกันเวลาบนเครื่องปิด ไม่มี KeepAlive/RunAtLoad log อยู่ `marketing/out/logs/weekly-draft.log` และ `weekly-draft.error.log` ควรล้าง log เก่าตามรอบ หาก crash ทิ้ง `out/.weekly-lock` ตรวจว่าไม่มี process ทำงานแล้วจึงลบ lock ด้วยตนเอง

## กฎเนื้อหา

ใช้โทนสุภาพ ใช้งานได้จริง ไม่ให้คำปรึกษาคดีเฉพาะราย ไม่ใส่ข้อมูลลูกความ/คู่ความ/เลขคดีจริง ไม่รับประกันผลหรือแต่งคำรับรอง ใช้เฉพาะปฏิทินนัดศาล / My Day, บันทึกผลนัด, กำหนดส่งที่ทนายตรวจ, แอปมือถือ, client portal เฉพาะข้อมูลที่สำนักงานเลือกแชร์ และค่าใช้จ่าย ไม่อ้างคำนวณอุทธรณ์อัตโนมัติหรือ AI ทำแทนทั้งหมด ไม่อ้างว่ามีแบบดาวน์โหลด/โปรโมชัน/pilot หากยังไม่มีหลักฐาน CTA ใช้ samnuan.com หรือคำว่า LINE OA ห้ามเดา handle/URL

schema ตรวจโครงสร้างและความยาว ไม่ตรวจข้อเท็จจริงแทนคน อีเมลส่งเฉพาะผู้ตรวจภายใน ไม่ใช้ kit ส่งการตลาดให้ลูกค้า ไม่มี social token, SDK, endpoint หรือ scheduler สำหรับเผยแพร่ใน kit

## ผลตรวจในสภาพแวดล้อมที่สร้าง kit

- `node marketing/scripts/check.mjs` ผ่าน: sample/schema, เพดานข้อความ, ข้อมูลผิดรูปแบบ, หัวข้อซ้ำ/ไม่ตรง, path ไม่ปลอดภัย และการหมุนหัวข้อทั้งหมด/กลางชุด
- syntax ของสคริปต์และ `plutil -lint` ผ่าน
- เรียก `weekly-draft.mjs --dry-run` และ `check.mjs --render-stress` จริงแล้ว แต่ Chromium เปิดไม่ได้ใน sandbox: `bootstrap_check_in … MachPortRendezvousServer … Permission denied (1100)` จึง **ยังไม่มี PNG/posts.md จาก dry-run และยังไม่ผ่านการตรวจภาพด้วยตา/ขนาดมือถือ** ห้ามถือว่า layout ผ่านแล้ว
- log ความล้มเหลวอยู่ `marketing/out/dry-run-verification.log` และ `marketing/out/stress-render.log`; stress JSON อยู่ `marketing/out/stress/posts.json` ทั้งหมดถูก ignore
- ไม่เรียก Codex ร่างจริง ไม่ส่งอีเมล ไม่สมัครบริการ ไม่โหลด launchd และไม่ commit
