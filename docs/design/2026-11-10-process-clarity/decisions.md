# Process clarity redesign (Shopee-style "บังคับทำให้จบ") — decisions

Source: grilling session 2026-11-10. Users = lawyers, feedback given **after** the guided-UI deploy (`prod-20261110-guided-ui`):
"ดูเยอะ ไม่เหมือน Shopee ที่บังคับเราทำให้จบ" — e.g. create a case, fill Own Ref… then: is it done? what does the system do next? what do I do next?

Principle: one screen = one next action + one primary button; progress shown, not operated; everything else collapsed.
Backend already has the forcing engine (`apps/api/src/cases/case-journey.ts`: 8 main stages, `next`, `canAdvance`, `blockers`) — this is mostly a presentation change.

## Round 1 — case spine (web)
1. **Case list** — two layers:
   - Primary tabs by who moves next: **ต้องทำ · รอลูกความ · รอศาล/รอนัด · ปิดแล้ว** (each case in exactly one tab; default ต้องทำ).
   - Secondary phase chips (ก่อนฟ้อง · ในศาล · บังคับคดี …) filter within the tab, counts per tab.
   - Case with no open task and no upcoming court date → ต้องทำ with "กำหนดขั้นถัดไป".
   - Each row: stage + n/m, "ต่อไป: …", [ทำเลย] → case's next-action card.
   - Needs API classification (new).
2. **Create case** — short single page: type · title (auto) · client · responsible lawyer · current stage (court + black no. only if filed) · Own Ref shown on top as "เลขคดีของคุณ: TSBREF… ✎".
   Everything else is asked later by the next-action card. Case-type required custom fields move from create-time to a gate for leaving the first stage.
3. **After create** — **chosen: (B) separate success page** (2026-11-10). "เริ่มขั้นที่ 1" goes to the case page's next-action card; "ไปหน้าคดี" opens the case page. Options considered:
   - (A) case page with status card on top: ✓ opened · "ระบบทำให้แล้ว" (conflict check, limitation reminder, court date, notify owner) · "ต่อไปคุณต้องทำ (1 จาก n)" [ทำเลย].
   - (B) separate "เปิดคดีสำเร็จ" page, Shopee order-success style.
4. **Case page** — Shopee order-detail: one-line 8-step tracker · "สิ่งที่ต้องทำตอนนี้ (x จาก y)" card with one big button + other tasks of this stage collapsed · one line "ระบบกำลังทำ: …" · collapsed rows ข้อมูลคดี / เอกสาร / บัญชี / ข้อความ.
   Manual "เปลี่ยนขั้นตอนเอง" goes into ⋯ only; irrelevant tabs hidden. Routes, permissions, data unchanged.
5. **My tasks (/todos)** — tabs **ต้องทำ · รอคนอื่น · เสร็จแล้ว**; chips เลยกำหนด · วันนี้ · สัปดาห์นี้; row shows case + stage n/m.

## Round 2 — other process pages (same pattern, same release)
Intake (`/intake`, `/intake/new`, `/intake/[id]`, `IntakeStage`), email intake, expenses (`/expenses`, `/expenses/new`, `/expenses/claim`, `/admin/reimbursements`), invoices, leaves.
Non-process pages (settings, admin config, knowledge, research, reports) keep the existing PageGuide only.

## Copy rules (reviewed with thai-translate)
Workplace register, no ครับ/ค่ะ. Own Ref = "เลขอ้างอิงสำนักงาน" (never "เลขคดี" — clashes with เลขคดีดำ/แดง).
Stage choice = "ยังไม่ถึงชั้นศาล / อยู่ในชั้นศาลแล้ว" (works for defendant side). "ตรวจสอบผลประโยชน์ขัดกัน", "ระบบดำเนินการให้แล้ว", "ระบบจะแจ้งเตือน: …".
Stage advance stays a user action ("ทำครบทุกงานแล้ว จึงไปขั้น… ได้") — no auto-advance claim.

## Mockups (Stitch project 394194744767221958) — round 1
`mockups/1-case-list.png` (637a362b98a94da48574b6f370da0510), `2-create-case.png` (e434a15c866944c5b3e4ae035d00ae8c),
`3a-after-create-card.png` (18ace2eda1474da1a5c8134b75687bb3), `3b-after-create-success-page.png` (9a65892a9272469fa01a94d6b3fb7cc7),
`4-case-page.png` (d88e92ea99664d7491dac761493538aa), `5-my-tasks.png` (81b62260d5e14d7ab3732941bc419d34).

## Out of scope
Mobile app (no users yet).
