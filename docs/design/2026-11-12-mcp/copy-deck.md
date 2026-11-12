# MCP UI copy deck (Thai, workplace register, no ครับ/ค่ะ)

Terms reused from app: การเชื่อมต่อ (tab), ยกเลิกการเชื่อมต่อ, เชื่อมต่ออยู่, ตั้งค่าสำนักงาน, เจ้าของสำนักงาน, ลองใหม่อีกครั้ง.
Feature name: "AI ของคุณ (Claude, Codex)". Never say "MCP" except inside the command text.

## S1 — ตั้งค่า › การเชื่อมต่อ › section "AI ของคุณ"
Title: ใช้ Claude, ChatGPT หรือ Codex ทำงานกับคดีใน Samnuan
Desc: เชื่อมต่อครั้งเดียว แล้วสั่งงานจากแชท AI ได้เลย — ค้นคดี อ่านเอกสาร สร้างงาน ลงโน้ต และลงเวลา AI เห็นเฉพาะคดีที่คุณรับผิดชอบหรือมีงานอยู่
Step 1 คัดลอกที่อยู่สำหรับเชื่อมต่อ | field https://api.samnuan.com/mcp | btn คัดลอกที่อยู่ | hint ใช้วางในแอป AI ตามขั้นที่ 2
Step 2 ตั้งค่าในแอป AI ที่ใช้ | tabs Claude (เว็บและแอป) · Claude Code · Codex · ChatGPT
  Claude: 1) ใน Claude ไปที่ Settings › Connectors  2) กด Add custom connector แล้ววางที่อยู่  3) กด Connect
  Claude Code: `claude mcp add --transport http samnuan https://api.samnuan.com/mcp` btn คัดลอกคำสั่ง; then พิมพ์ /mcp แล้วเลือก samnuan เพื่อเข้าสู่ระบบ
  Codex: `codex mcp add samnuan --url https://api.samnuan.com/mcp` แล้ว `codex mcp login samnuan`
  ChatGPT: 1) ใน ChatGPT ไปที่ Settings › Apps & Connectors › Advanced แล้วเปิด Developer mode 2) กด Create แล้ววางที่อยู่ เลือกการยืนยันตัวตนแบบ OAuth 3) กด Create แล้วเลือก Samnuan ในแชทใหม่ | note: ใช้ได้เฉพาะแพ็กเกจ ChatGPT ที่มี Developer mode — บัญชี Business ต้องให้ผู้ดูแล workspace เปิดให้ก่อน
Step 3 เข้าสู่ระบบและกดอนุญาต | หน้า Samnuan จะเปิดขึ้นให้ยืนยันว่าอนุญาตให้ AI เข้าถึงข้อมูลของคุณ
What AI can do:
  อ่าน — คดี เอกสาร นัด และงานที่คุณรับผิดชอบหรือมีงานอยู่ — ไม่เห็นงานของคนอื่น
  บันทึก — สร้างและปิดงาน ลงโน้ตในคดี ลงเวลา ร่างรายการเบิกและหนังสือทวงถาม (ตรวจแล้วส่งเองในแอป) ยื่นลาของคุณเอง (ติดป้าย "ผ่าน AI" ให้ทีมเห็น)
  เสนอวันนัดศาล — เข้าปฏิทินเมื่อคุณกดรับในหน้าคดีแล้วเท่านั้น
  ทำไม่ได้ — แก้หรือลบข้อมูล อัปโหลดเอกสาร
Privacy note: ข้อมูลที่ AI อ่านจะส่งไปยังผู้ให้บริการ AI ตามบัญชีของคุณ (Anthropic หรือ OpenAI) ใช้ตามนโยบายของสำนักงาน
Connected list title: แอปที่เชื่อมต่ออยู่ (2)
  row: Claude · เชื่อมต่อเมื่อ 3 พ.ย. 2569 · ใช้ล่าสุด 10 นาทีที่แล้ว · btn ยกเลิกการเชื่อมต่อ (hint: AI จะเข้าถึงข้อมูลไม่ได้ทันที)
  row: Codex · เชื่อมต่อเมื่อ 8 พ.ย. 2569 · ใช้ล่าสุด เมื่อวาน
  footnote: การเชื่อมต่อที่ไม่ได้ใช้ 90 วันจะหมดอายุ ต้องเข้าสู่ระบบใหม่
  confirm dialog: ยกเลิกการเชื่อมต่อ Claude? / Claude จะอ่านหรือบันทึกข้อมูลใน Samnuan ไม่ได้อีก ถ้าต้องการใช้ต่อต้องเชื่อมต่อใหม่ / [ยกเลิกการเชื่อมต่อ] [ไม่ยกเลิก]
Disabled state (firm off): เจ้าของสำนักงานยังไม่ได้เปิดให้เชื่อมต่อ AI — ขอให้เจ้าของสำนักงานเปิดที่ ตั้งค่าสำนักงาน › AI ของทนาย

## S2 — /oauth/authorize (consent)
Title: Claude ขอเชื่อมต่อกับบัญชี Samnuan ของคุณ
Account: สมชาย ใจดี · somchai@jaidee-law.co.th · สำนักงานกฎหมายใจดี | link เปลี่ยนบัญชี
Lead: เมื่ออนุญาต Claude จะทำสิ่งเหล่านี้แทนคุณได้
  อ่านคดี เอกสาร นัด และงานที่คุณรับผิดชอบหรือมีงานอยู่
  สร้างและปิดงาน ลงโน้ตในคดี และลงเวลา
  เสนอวันนัดศาล ซึ่งคุณต้องกดรับในแอปก่อน
Notice: ข้อมูลที่ Claude อ่านจะส่งไปยัง Anthropic ยกเลิกการเชื่อมต่อได้ทุกเมื่อที่ ตั้งค่า › การเชื่อมต่อ
Buttons: [อนุญาตให้ Claude เชื่อมต่อ] [ไม่อนุญาต]
Redirect line: หลังกดอนุญาต จะกลับไปที่ claude.ai
Error (firm off): สำนักงานของคุณยังไม่เปิดให้เชื่อมต่อ AI — ติดต่อเจ้าของสำนักงาน

## S3 — ตั้งค่า › ตั้งค่าสำนักงาน › card "AI ของทนาย" (owner)
Title: AI ของทนาย (Claude, Codex)
Desc: ให้ทนายในสำนักงานใช้ AI ของตัวเองทำงานกับคดี — แต่ละคนเห็นเฉพาะคดีที่ตัวเองรับผิดชอบหรือมีงานอยู่ รวมถึงเจ้าของสำนักงานและผู้ดูแล
Switch: อนุญาตให้ทนายเชื่อมต่อ AI ของตัวเอง | hint (on): ข้อมูลคดีที่ AI อ่านจะส่งไปยังผู้ให้บริการ AI ของแต่ละคน | hint: ปิดเมื่อไรจะตัดการเชื่อมต่อทุกคนทันที
Confirm turning off: ปิดการเชื่อมต่อ AI ทั้งสำนักงาน? / การเชื่อมต่อ 3 รายการจะถูกตัดทันที ทนายต้องเชื่อมต่อใหม่เมื่อเปิดอีกครั้ง / [ปิดและตัดการเชื่อมต่อ] [ไม่ปิด]
Table: ผู้ที่เชื่อมต่ออยู่ (3) — ทนาย | แอป | เชื่อมต่อเมื่อ | ใช้ล่าสุด | btn ยกเลิกการเชื่อมต่อ
Link: ดูสิ่งที่ AI บันทึกในประวัติการใช้งาน
Empty: ยังไม่มีทนายเชื่อมต่อ — ส่งลิงก์ ตั้งค่า › การเชื่อมต่อ ให้ทีมเพื่อเริ่มใช้

## Stitch screens (project 394194744767221958)
- S1 การเชื่อมต่อ: 21a36a8dad6649f1ad093b43c0172405 → s1-connect.png
- S2 consent: 7faa3e76eb0c422ebd0fe524103b6ff1 → s2-consent.png
- S3 owner: 250082a0ef4644709162a320b9da2317 → s3-owner.png (Stitch screenshot cuts at the table; below it: rows 2–3, link "ดูสิ่งที่ AI บันทึกในประวัติการใช้งาน", confirm dialog per copy above)

## Build notes (not visible in mockup)
- Consent page: client name comes from untrusted DCR metadata — show the redirect host ("จะกลับไปที่ claude.ai") taken from the validated redirect_uri; use a generic app icon, not a vendor logo.
- S3 table becomes record rows under 768px (design.md: phones favor record rows).
- Switch and every "ยกเลิกการเชื่อมต่อ" button need accessible names that include the person/app.
- Nav rail/top bar in mockups are Stitch approximations; keep the app's real shell.

NOTE: s2/s3 PNGs predate the "รับผิดชอบหรือมีงานอยู่" wording (Stitch DOM edits did not re-render). The text in this deck wins.
