# Global SaaS หลายวิชาชีพ: ฟีเจอร์ที่ขายได้และแผนขยาย Samnuan / LexFlow

วันที่ตรวจค้น: 2026-11-14 · ขอบเขต: Global SMB professional services · ภาษา product/feature ใช้ English

รายงานนี้ใช้เว็บสดจากเจ้าของผลิตภัณฑ์ หน่วยงานสถิติ สมาคมวิชาชีพ และหน่วยงานกำกับ; ใช้โค้ดเพื่อระบุสิ่งที่มีอยู่เท่านั้น ไม่ได้รัน application หรือพิสูจน์ production readiness. ราคาคือ snapshot ตามหน้า/ภูมิภาคที่อ้าง ไม่ใช่ใบเสนอราคา รวมภาษีเฉพาะเมื่อระบุชัด; ไม่แปลงสกุลเงินด้วยอัตราที่ไม่ได้ตรวจสอบ

**วิธีอ่านตัวเลข:** จำนวนบุคลากร บริษัท และธุรกรรมเป็น market-size proxy คนละหน่วย ไม่ใช่จำนวนผู้ซื้อ SaaS และห้ามบวกเข้าด้วยกันเป็น Global TAM. ขนาดตลาดซอฟต์แวร์รวมที่ยืนยันไม่ได้ระบุ *unverified*. คะแนน ลำดับ ความพยายาม ราคาเสนอของ Samnuan เป้าหมาย และกรอบเวลาเชิงแผนทั้งหมดเป็น *estimate*; ไม่ใช่ผลทดลองขาย. การมีฟีเจอร์ในแพ็กเกจพิสูจน์ packaging ได้ แต่ไม่พิสูจน์ paid attach rate

## TL;DR: ฟีเจอร์ที่ควรสร้างและขาย 10 อันดับ

**ควรขายผลลัพธ์ “ลูกค้าส่งเอกสารครบ ทีมรู้เจ้าของงาน และเรียกเก็บเงินได้” ก่อนขายระบบจัดการทุกวิชาชีพ.** แนะนำ accounting/bookkeeping เป็นตลาดแรก และ Canadian licensed immigration consultants เป็นตลาดที่สองแบบจำกัดประเทศ. ใช้ shared core แล้วแยก terminology/template/country packs; AI เป็นตัวช่วยที่ผู้ใช้เรียกและตรวจได้ตามแนวทางเดิม

สูตรจัดอันดับเชิงผู้วิจัย *estimate*: `Revenue potential (R) × existing-code fit (F) ÷ effort weight (E)`. R/F ใช้สเกล 1–5; S=1, M=2, L=4. R ประเมิน recurring value, pricing evidence และความถี่ของ pain ไม่ใช่ market-size multiplication; F ประเมิน primitives ที่เห็นใน source. Effort คือส่วนเพิ่มของ feature หลังทำ profession/English/security foundation แล้ว; S ไม่ได้หมายความว่า global launch ทั้งชุดทำง่าย. คะแนนทั้งหมดเป็น *estimate* และเป็นเครื่องมือจัดลำดับ ไม่ใช่ revenue forecast

| อันดับ / feature | Target professions | Pricing model / price point ที่พบในตลาด | Effort / คะแนน *estimate* | Existing code ที่ reuse |
|---|---|---|---|---|
| 1. Curated recurring workflow + profession packs | Accounting, compliance consulting, immigration | [Karbon](https://karbonhq.com/pricing/) Team $59 → Business $89/user/month annual: uplift ของ bundle automation/reminders ไม่ใช่ค่า template แยก; template library แจกฟรี | S; 4×5÷1=20 | `WorkflowTemplate/Run`, SOP, `PlaybookRelease`, [practice-setup](../../apps/api/src/practice-setup) |
| 2. Intake forms + client document checklist/chasing | Accounting/tax, immigration, insurance | [PracticePanther](https://www.practicepanther.com/pricing/) Business $89/user/month annual รวม intake/eSign/texting; [TaxDome](https://help.taxdome.com/article/subscription-overview) เริ่ม US$1,500/year/150 active accounts รวมถึง 20 team members สำหรับ cohort ใหม่ | M; 5×5÷2=12.5 | `Intake`, document requests, portal submissions, follow-ups, `CaseType.fieldSchema` |
| 3. Client portal + secure updates / approvals | ทุกกลุ่มที่แนะนำ | [Canopy](https://www.getcanopy.com/pricing/) Standard $74/user/month annual มี portal/messaging; [PracticePanther](https://www.practicepanther.com/pricing/) portal อยู่ทุกแผน; ควรเป็น core value แล้วขาย advanced branding/automation | M; 4×5÷2=10 | [client-portal](../../apps/api/src/client-portal), contact access, messages, document publication |
| 4. Document / proposal automation | Accounting engagement letters, immigration evidence packs, consultants | [PandaDoc](https://support.pandadoc.com/en/articles/9715033-compare-subscription-plan-features) Starter $19 / Business $49/user/month annual เป็น document-workflow benchmark | M; 4×4÷2=8 | [templates](../../apps/api/src/templates), DOCX builder, custom fields, versions |
| 5. WIP / margin / aging / capacity reporting | Accounting, A&E, consultants/agencies | [Canopy](https://www.getcanopy.com/pricing/) Plus $109 เทียบ Standard $74/user/month annual เพิ่ม capacity/custom reporting เป็น tier bundle | M; 3×5÷2=7.5 | [reports](../../apps/api/src/reports), time/expense, invoices, collections, workload |
| 6. eSignature + identity checks ผ่าน provider | Accounting, immigration, IP, consultants | [Karbon](https://karbonhq.com/pricing/) eSignature 100 credits/$100; signature request 1 credit, KBA 2; แยก pass-through usage จาก subscription | M; 4×3÷2=6 | Document versions/review/publication + invoice/status/audit; ต้องเพิ่ม signing integration |
| 7. User-approved AI document/intake Copilot | Accounting, immigration, claims | [Freshdesk](https://www.freshworks.com/freshdesk/pricing/) $29/agent/month Copilot add-on; [TaxDome AI](https://help.taxdome.com/article/ai-add-on) $200/firm/month; [Karbon AI](https://karbonhq.com/feature/ai) ไม่มีค่าเพิ่ม แสดงว่าราคา premium ไม่ใช่กฎตายตัว | L; 5×4÷4=5 | [intelligence](../../apps/api/src/intelligence), RAG, date/field proposals, `AiRun`, quota, AI tray |
| 8. Maintained deadline / compliance packs | Immigration, IP, accounting, HR/compliance | [LawToolBox](https://lawtoolbox.com/pricing/) $39/user/month annual สำหรับ 2–9 users; คุณค่าคือกฎที่มีเจ้าของอัปเดต ไม่ใช่ calendar อย่างเดียว | L; 4×4÷4=4 | `DeadlineRule`, `PublicHoliday`, suggestions, reminders; ต้องเปลี่ยน trigger/jurisdiction |
| 9. Priority integrations + governed API/MCP | Accounting, consulting, recruitment | [Freshdesk](https://www.freshworks.com/freshdesk/pricing/) MCP $15/1,000 actions, connector tasks $80/5,000 tasks เป็น usage benchmark; basic exports ควรช่วย acquisition | L; 4×4÷4=4 | [MCP](../../apps/api/src/mcp), Outlook/email, import/audit; QuickBooks/Xero/ATS connector ใหม่ |
| 10. Client invoice payments + collection automation | Accounting, consultants, immigration | [Canopy](https://www.getcanopy.com/pricing/) US cards 3.30%+$0.20; ACH 1% cap $10 เป็น merchant charge ไม่ใช่ net revenue ของ platform | L; 5×3÷4=3.75 | Invoice/payment/collections เดิม; Stripe subscription เป็นฐานบางส่วน แต่ client-money flow ต้องออกแบบแยก |

ราคา $ ในตารางนี้เป็น USD จากหน้า US เว้นแต่ระบุ; annual = ราคาเทียบรายเดือนเมื่อชำระรายปี ไม่ใช่ราคาจ่าย month-to-month. คะแนนอันดับ 8–9 เท่ากัน จัด deadline ก่อนตามความแตกต่างของ vertical (*estimate*). Scheduling ควรเชื่อม/ฝังจากผู้ให้บริการในระยะแรก; white-label ขายต่อเมื่อมีความต้องการจริง. SOC 2, GDPR และ residency เป็นข้อผูกพันที่ต้องทำจริง ไม่ควรเริ่มจากการสร้าง checkbox แพ็กเกจ Enterprise

## ความสามารถที่มีอยู่จาก source code

สแกนชื่อ model ใน [Prisma schema](../../apps/api/prisma/schema.prisma) และรายชื่อ module ใต้ [API source](../../apps/api/src) แล้วอ่านเฉพาะจุดเกี่ยวข้อง. รายการต่อไปนี้เป็น source evidence; การมี model/module ไม่เท่ากับมี flow ที่ตรวจผ่านใน production

- **Tenant และทีม:** `Firm`, `FirmMember`, `Invitation`, `Subscription` และ tenant middleware; ใช้เป็นขอบเขตสำนักงานและแพ็กเกจได้ ([schema](../../apps/api/prisma/schema.prisma), [saas](../../apps/api/src/saas))
- **สิทธิ์และการแยกข้อมูล:** guards, `CaseAccessService`, `assertFirmRefs` ตรวจ foreign IDs ข้าม tenant; ต้องรักษากฎนี้เมื่อเพิ่ม custom entities ([case access](../../apps/api/src/common/services/case-access.service.ts), [firm refs](../../apps/api/src/common/firm-refs.ts))
- **Clients / contacts / payer:** `Client`, `ClientContact`, `CaseCustomer`, `CaseClient`, bill-to customer แยกผู้ว่าจ้างกับผู้เกี่ยวข้องได้ ([schema](../../apps/api/prisma/schema.prisma), [clients](../../apps/api/src/clients))
- **Work item และ custom fields:** `Case`, `CaseType.fieldSchema`, `Case.customFields` มีฐานสำหรับ engagement/application/project แต่ lifecycle ยังเป็นงานกฎหมาย ([case types](../../apps/api/src/case-types), [cases](../../apps/api/src/cases))
- **Intake และ document request:** `Intake`, `IntakeFollowUp`, `IntakeDocumentRequest`, portal submissions และ attachments ([intake](../../apps/api/src/intake), [client portal](../../apps/api/src/client-portal))
- **Tasks / review / observers:** `Task`, assignments, comments, attachments, review rounds และ `TaskObserver` เป็นฐานงานมีเจ้าของและ reviewer ([tasks](../../apps/api/src/tasks), [schema](../../apps/api/prisma/schema.prisma))
- **Workflow และ SOP packs:** `WorkflowTemplate`, `WorkflowRun`, `Sop`, `PlaybookRelease`, `AppliedPlaybook`; ไม่ต้องสร้าง workflow engine ใหม่ก่อนทดลองขาย ([workflows](../../apps/api/src/workflows), [practice setup](../../apps/api/src/practice-setup), [sops](../../apps/api/src/sops))
- **Calendar และ workload:** events, assignees, availability, court-day responsibility, agenda, leave และ dashboard ([calendar](../../apps/api/src/calendar), [agenda](../../apps/api/src/agenda), [dashboard](../../apps/api/src/dashboard))
- **Deadline proposals:** `DeadlineRule`, `PublicHoliday`, `DocumentDateSuggestion`; กฎสร้างข้อเสนอให้คนยืนยัน ไม่ใช่เครื่องรับรอง deadline หลายประเทศ ([deadlines](../../apps/api/src/deadlines), [schema](../../apps/api/prisma/schema.prisma))
- **Documents / version / publication:** `Document`, `DocumentVersion`, `DocumentPublication`, office links และ review ([documents](../../apps/api/src/documents), [document review](../../apps/api/src/document-review))
- **Document automation:** `DocumentTemplate`, variable merging และ DOCX builder มีแล้ว; variables ยังผูก plaintiff/defendant/Thai court ([templates service](../../apps/api/src/templates/templates.service.ts), [DOCX builder](../../apps/api/src/templates/docx-builder.ts))
- **Time / expense / collections:** `TimeEntry`, `Expense`, `Invoice`, line items, partial payments, cash advances และ petty cash ([billing](../../apps/api/src/billing), [schema](../../apps/api/prisma/schema.prisma))
- **Portal / messaging:** contact login tokens, named matter access, `CaseMessage`, document publication และ annual report snapshots ([client portal](../../apps/api/src/client-portal), [schema](../../apps/api/prisma/schema.prisma))
- **Email และ Outlook:** mailbox connections, threads, attachments, field proposals, calendar copies/changes และ add-in integration ([email intake](../../apps/api/src/email-intake), [outlook integration](../../apps/api/src/outlook-integration))
- **AI แบบผู้ใช้เรียก:** OCR/extraction, date/field suggestions, RAG, `AiRun`, quota และ AI tray; tray ระบุว่าไม่รัน AI เอง ([intelligence](../../apps/api/src/intelligence), [RAG](../../apps/api/src/rag), [AI tray](../../apps/api/src/ai-tray/ai-tray.service.ts))
- **MCP และ access consent:** OAuth, consent/revocation, tools และ connections เป็นฐาน external assistant integration ไม่ใช่หลักฐานว่ามี connector marketplace แล้ว ([MCP](../../apps/api/src/mcp))
- **Import / reporting / audit:** `DataImportBatch`, setup import, reports, automation logs และ audit logs มีฐานสำหรับ migration/onboarding และ operational evidence ([data import](../../apps/api/src/data-import), [reports](../../apps/api/src/reports), [audit log](../../apps/api/src/audit-log))
- **Commercial / security foundations:** Stripe subscription checkout และ `PlanAddOn`; sessions, email-code MFA และ file storage. Client invoice payments กับการรับค่าสมาชิก SaaS เป็นคนละระบบ; ยังไม่ใช่ embedded payments พร้อมขายทั่วโลก ([subscription service](../../apps/api/src/saas/subscription.service.ts), [auth](../../apps/api/src/auth), [file storage](../../apps/api/src/common/services/file-storage.service.ts))

อ่าน prior research ทั้งสามฉบับตามที่ระบุเพื่อกันการทำซ้ำ; ข้อเสนอในรายงานนี้เปลี่ยนโจทย์เป็น global commercial packaging และ non-legal workflows ไม่สรุปตลาดหน่วยงานรัฐ/AMC ไทยซ้ำ

## สองวิชาชีพแรกและแผน wedge 90 วัน

### Accounting / bookkeeping / tax-advisory firms

**Wedge:** recurring monthly-close / tax-document readiness สำหรับสำนักงานที่รับงานจาก SME หลายราย: เปิด engagement → checklist ตามประเภทลูกค้า → portal upload → reminder → reviewer → deliverable/approval → invoice. ไม่ต้องแข่งเป็น general ledger, payroll หรือ tax-return calculation engine. ความถี่งานและผู้รับผิดชอบตรงกับ Task/Workflow/Intake/Portal เดิม; Karbon/TaxDome/Canopy เป็นหลักฐานว่ามีหมวดงบซื้อจริง แต่ไม่พิสูจน์ว่าสำนักงานจะเปลี่ยนมาใช้เรา

Intuit สำรวจ accounting professionals ใน US 700 คนเมื่อ April 2025; รายงานว่า 95% ของ firms ใช้ automation ในปีที่ผ่านมา. นี่เป็น vendor-commissioned survey ของตลาด US ไม่ใช่ global census หรือ paid attach. ใช้สนับสนุนความพร้อมด้าน workflow เท่านั้น ([Intuit survey](https://quickbooks.intuit.com/r/small-business-data/accountant-tech-survey-2025/), [official release](https://investors.intuit.com/news-events/press-releases/detail/1263/accountants-embrace-ai-and-strategic-advisory-services-to-fuel-growth-yet-continue-to-face-tech-and-talent-barriers-according-to-2025-intuit-quickbooks-survey))

### Licensed immigration consultants: เริ่ม Canada

**Wedge:** application readiness สำหรับ RCIC: applicant/household intake → passport/status expiry fields → checklist → evidence review → client update → export handoff. ใช้ผู้ประกอบวิชาชีพท้องถิ่นตรวจ pack; เริ่มจาก readiness โดยยังไม่รับปาก government-form auto-fill/e-filing หรือ automatic legal advice. [CICC](https://college-ic.ca/ICCRC/Assets/Documents/AnnualReport/2026_Annual_Report/Annual-Report-2026-College.pdf) มีทะเบียนผู้ประกอบวิชาชีพและตลาดระบุขอบเขตได้ชัดกว่า “immigration ทั่วโลก”

**เหตุผลที่เป็นอันดับสอง:** case/deadline/document/portal ใกล้แกนเดิมมาก แต่ household privacy, ภาษาเอกสาร และ country-specific forms เพิ่มภาระ; Docketwise เป็น US benchmark ไม่ใช่หลักฐานว่า workflow/form library ใช้แทนของ Canada ได้. หากหา licensed design partner ไม่ได้ ให้เลื่อนกลุ่มนี้และทดลอง management/compliance consultants เป็น fallback; ไม่เปิดให้ใช้กฎ deadline ที่ยังไม่มีผู้รับรอง

### แผน 90 วัน — ทุกช่วง จำนวน และ KPI ต่อไปนี้เป็น *estimate / proposed target*

| ช่วง | Shared core / accounting | Immigration / Canada | หลักฐานก่อนเดินต่อ |
|---|---|---|---|
| วัน 1–15 | สัมภาษณ์ accounting firms 8 แห่ง ใช้เอกสารตัวอย่างที่ได้รับอนุญาต; เลือก recurring workflow เดียว; วัดเวลาตามเอกสาร baseline | สัมภาษณ์ RCIC firms 5 แห่ง; หา licensed content owner; เลือก application-readiness workflow เดียว | มี problem owner, buyer, baseline และ consent ในการใช้ sample; ยังไม่ซื้อว่า global demand มีจริงจากจำนวนอาชีพ |
| วัน 16–30 | English terminology pack, custom field contracts, recurring task/checklist, client portal; เลือก initial hosting region และ DPA | ทำ applicant/household access design และ checklist pack กับ partner; deadline เป็น explicit user-entered/confirmed | ลูกค้าจำลองทำ intake → upload → review → update ได้; ไม่มี court-only field บังคับ; tenant/portal access checks ผ่านก่อนข้อมูลจริง |
| วัน 31–60 | Accounting paid pilots 3 firms; assisted CSV import; email/calendar integration ที่มีจริง; manual payment link ถ้า embedded rails ยังไม่พร้อม | RCIC pilots 2 firms เมื่อ content/privacy gate ผ่าน; client language support เฉพาะที่ยืนยันความต้องการ | วัด completion, chasing time, missed deadlines, weekly use และ support hours; รายงาน source/runtime/pilot evidence แยกกัน |
| วัน 61–90 | ทดลอง offer Standard US$49–79/user/month หรือ firm pack US$149–299/month; เป็นราคา hypothesis ไม่ใช่ market quote; เลือก metric เดียวต่อ cohort | ทดลอง readiness firm pack US$149–299/month; แยกค่า setup/content localization; ยังไม่ขายทุกประเทศ | เป้าหมายต่ออายุ/ยืนยันซื้ออย่างน้อย 3 จาก paid pilots รวม 5 firms, chasing time ลด ≥25%, activation ≤7 วัน, severe cross-tenant disclosure = 0; หากไม่ผ่านให้แก้ wedge ก่อนเพิ่ม vertical |

**Packaging hypothesis (*estimate*):** core = clients + engagements + tasks + documents + secure portal + basic export; Growth = intake/chasing/recurring packs/reporting; add-ons = eSign usage, capped AI, migration, specialist rule packs. ตั้ง cap/alert สำหรับ usage และแสดงต้นทุนชัดเจน. ไม่คิด external client/portal seats แบบเดียวกับ staff จนกว่าจะทดสอบ willingness-to-pay. ราคาเสนอทั้งหมดต้องทดสอบกับ offer จริง โดยไม่อนุมานจากราคาคู่แข่งว่าปิดการขายได้

**ขอบเขตที่คุม effort:** ใช้ระบบบัญชี/ยื่นแบบของลูกค้าเดิม; ไม่มี payroll, tax computation, official visa decisions, ATS เต็มรูป, BIM หรือ insurance claims adjudication ใน wedge. Measurement plan ต้องบันทึก paid-eligible firms, firms ที่จ่าย add-on จริง, usage/cost และ cancellation แยกกัน เพื่อให้ได้ attach rate ของเราในภายหลัง

## Q1: วิชาชีพข้างเคียงที่เหมาะกับ Global SaaS

### วิธีคัดเลือกและขนาดตลาดที่ตีความได้

เลือก 7 กลุ่มจากความถี่ของ recurring work, ความสำคัญของ docs/deadlines/client collaboration, ผู้ซื้อที่เข้าถึงได้ และช่องว่างที่ไม่บังคับสร้างระบบเฉพาะทางใหม่ทั้งหมด. ตารางนี้เป็น **ลำดับลงทุนเชิงผู้วิจัย (*estimate*)**; ลำดับไม่ใช่อันดับขนาดตลาด. Global หมายถึง core ที่รองรับหลายประเทศผ่าน country packs ไม่ใช่เปิด regulatory workflows ทุกประเทศพร้อมกัน

| ลำดับลงทุน *estimate* | กลุ่ม / market-size proxy ที่มีแหล่ง | Fit / ความเสี่ยงสำคัญ (*assessment*) |
|---|---|---|
| 1 | Accounting/bookkeeping/tax: US accountants/auditors ราว 1.6 ล้าน jobs ใน 2025 ([BLS](https://www.bls.gov/ooh/business-and-financial/accountants-and-auditors.htm)) | สูง; recurring docs/review/portal; incumbent แข็งและต้องอยู่ข้าง ledger |
| 2 | Licensed immigration: Canada RCIC 11,578 in good standing ณ 30 June 2026 ([CICC report](https://college-ic.ca/ICCRC/Assets/Documents/AnnualReport/2026_Annual_Report/Annual-Report-2026-College.pdf), หน้าเลขพิมพ์ 9) | สูงใน readiness; privacy, forms และ licensing ต่างประเทศ |
| 3 | Management/HR/compliance consultancies: US management analysts ราว 1.1 ล้าน jobs ใน 2025 ([BLS](https://www.bls.gov/ooh/business-and-financial/management-analysts.htm)) | สูงสำหรับ engagement ops; generic PM แข่งขันราคาหนัก |
| 4 | IP agents: ทั่วโลก patent applications 3.7 ล้าน และ trademark application class count 15.23 ล้าน ใน 2024 ([WIPO patents](https://www.wipo.int/web-publications/world-intellectual-property-indicators-2025-highlights/en/patents-highlights.html), [trademarks](https://www.wipo.int/web-publications/world-intellectual-property-indicators-2025-highlights/en/trademarks-highlights.html)) | สูงด้าน matter/docs แต่ authoritative docketing/rules liability สูง |
| 5 | Independent/public insurance adjusters: US claims adjusters/examiners/investigators 376,100 jobs ใน 2025 ([BLS](https://www.bls.gov/ooh/business-and-financial/claims-adjusters-appraisers-examiners-and-investigators.htm)) | โค้ด claim เดิมช่วย แต่ field evidence/estimating เป็นช่องว่าง |
| 6 | Architecture/engineering consultancies: US architects มากกว่า 123,000 คนใน 2025 ([NCARB](https://www.ncarb.org/press/the-number-of-us-architects-rose-6-2025)); US architecture firms มากกว่า 19,000 ตาม 2024 report ([AIA](https://www.aia.org/aia-architect/article/latest-insights-2024-firm-survey-report)) | operations fit; ต้อง phase budgets/resource finance; ไม่ครอบคลุม engineering ทั้งหมด |
| 7 | Recruitment/executive search: agencies ทั่วโลก placed 61 ล้านคนใน 2024 ตาม report 2026 ([WEC](https://wecglobal.org/publication-post/industry-impact-report-2026/)) | intake/client workflow พอ reuse แต่ ATS/search/sourcing ต้องสร้างมาก |

**ข้อจำกัดร่วม:** ทั้ง 7 กลุ่มยังไม่มี Global software TAM ที่ตรวจยืนยันในรายงานนี้ (*unverified*). ตัวเลข US เป็น regional lower-bound signal ของกิจกรรมอาชีพ ไม่ใช่ประมาณการยอด SaaS โลก. WIPO/WEC เป็น volume ต่อปี ไม่ใช่จำนวนสำนักงาน; การแบ่งตลาดเพื่อขายต้องสำรวจ firms, firm size, installed tools, reachable channels และ buyer budget เพิ่ม

### Accounting / bookkeeping / tax advisory

**ตลาดและ buyer:** เจ้าของสำนักงาน, practice manager หรือ operations lead เป็น buyer hypothesis (*estimate*). BLS รวม in-house staff ด้วย จึงห้ามใช้ jobs เป็น paying seats ของเราโดยตรง. มีงานซ้ำต่อ client/entity/period และ busy-season capacity constraints; การตามข้อมูลจากลูกค้าเป็น pain ที่ [Karbon อธิบายโดยตรง](https://karbonhq.com/resources/technology-and-modern-accounting-client-chase/)

**Incumbents / pricing:** [Karbon](https://karbonhq.com/pricing/) Team US$59/user/month annual หรือ $79 monthly; Business $89/$99; monthly จำกัดทีม 4 คนขึ้นไป. [Canopy](https://www.getcanopy.com/pricing/) Standard $74, Plus $109/user/month annual; Tax Resolution add-on $50/user/month annual. [TaxDome current guide](https://help.taxdome.com/article/subscription-overview) ลูกค้าใหม่ตั้งแต่ 2 November 2026 ใช้ client-based เริ่ม US$1,500/year สำหรับ 150 active accounts รวมถึง 20 team members ใน US; Canada เป็น CAD ตาม guide. Legacy seat-based cohorts คงเงื่อนไขเดิมจน renewal ที่เข้าเกณฑ์ตั้งแต่ January 2027. ไม่ใช้ $800/$1,000/$1,200 per-seat tiers เดิมเป็น current new-customer offer

**Primitives ที่โอนย้าย:** Case→Engagement; clients/contacts, recurring tasks, reviewer, document request, portal, email, time/fixed-fee invoice และ workload. **Gaps:** fiscal period/entity, recurring engagement creation, complete/missing-doc state, engagement letter/eSign, QuickBooks/Xero sync, completion/reopen control และ country-specific tax date packs. **Wedge:** monthly-close/document readiness ที่อยู่ข้าง ledger เดิม. Tax-filing, payroll และ full accounting engine อยู่นอกขอบเขตนี้; ถ้า interviews บอกว่าไม่มี native tax-software integration แล้วซื้อไม่ได้ ต้องประเมิน effort ใหม่ก่อนอ้างว่า fit สูง

### Licensed immigration consultants

**ตลาด:** CICC 2026 report เป็น regulated Canadian segment; Australia [OMARA](https://www.mara.gov.au/about-us/what-we-do) live ระบุ registered migration agents มากกว่า 5,500 แต่หน้าไม่มี snapshot date ชัด จึงไม่บวกรวมเป็น global total. นอกเหนือจากงานกฎหมายของทนาย ให้เลือก licensed consultant ที่กฎหมายประเทศนั้นรับรอง; [US DOJ guidance](https://www.justice.gov/eoir/page/file/1480746/dl) ระบุว่า immigration consultants/notarios ที่ไม่ได้เป็น attorney/accredited representative ไม่อาจให้ legal advice/services แบบผู้มีสิทธิ์ได้

**Incumbents / pricing:** [Docketwise](https://www.docketwise.com/pricing/) US Basic $80/user/month annual หรือ $90 monthly; Pro $100/$120, Advanced $120/$140 ([official help](https://supportcenter.docketwise.com/en/articles/9372148-docketwise-pricing)). เป็น US forms/workflow benchmark. [Migration Manager](https://www.migrationmanager.com.au/pricing/) Australia แสดง $339/licence/month สัญญา 12 เดือน หรือ $259 บน 24 เดือน ไม่รวม GST และ $900 professional fee; หน้าใช้ `$` ไม่แสดง ISO currency ชัด: AUD เป็น *inference / currency unverified* ต้องยืนยัน quote. ไม่เทียบค่ารายเดือนต่าง commitment เป็นราคาเดียวกัน

**Pains (*inference จาก vendor workflows*):** ข้อมูล applicant/household ซ้ำใน questionnaires, เอกสาร/visa หมดอายุ, version ของ form, ลูกค้าหลายภาษา, sponsor/representative authority และ status updates. **Transfer:** matter/case, parties/contacts, docs, deadlines, portal, fixed fee และ audit. **Gaps:** household/dependant graph, per-person access, passport/visa expiry, country-specific forms/field mapping/version, authority/consent และ sponsor portal. **Wedge:** Canadian RCIC readiness + evidence checklist มี licensed content owner; applicant readiness ไม่เท่ากับ eligibility decision หรือ government submission

### Management / HR / compliance consultancies และ specialist agencies

**ตลาด:** management analysts US proxy ครอบ in-house และ self-employed ไม่ได้แยก HR/compliance consultancies; firm count และ global reachable spend ยัง *unverified*. เลือก niche เช่น compliance evidence engagements หรือ HR investigation/document-heavy advisory ก่อน generic creative agency PM

**Incumbents / pricing:** [Scoro](https://www.scoro.com/pricing/) configurator แสดง time-billing combination เริ่ม €15/user/month, minimum 5 users; Projects & Resources €25, End-to-end €52; final app/extras/commitment ต้องยืนยัน quote. [SuiteDash](https://suitedash.com/pricing/) Start US$19/month หรือ $180/year, Thrive $49/month, Pinnacle $99/month แบบ firm-level ตามเงื่อนไข. monday/HubSpot เป็น horizontal substitutes ด้าน project/CRM/automation แต่ต้องต่อ delivery/billing/portal ตามโจทย์; [HubSpot Credits](https://www.hubspot.com/products/artificial-intelligence/credits?re=true) เป็นตัวอย่าง usage monetization ไม่ใช่ราคาชุด consultancy practice management

**Pains (*inference*):** proposal→delivery handoff, scope creep, retainer usage, evidence collection, approval delay, utilization/margin. **Transfer:** engagement, tasks, portal, docs, time/billing/workload. **Gaps:** SOW/change request, deliverable acceptance, retainer balance, role cost rate, risk/control/evidence register สำหรับ compliance. **Wedge:** client-evidence-to-reviewed-deliverable; ใช้เป็น fallback เมื่อไม่มี licensed immigration partner. ไม่ขยายเป็น payroll/HRIS หรือ compliance rule engine ครบโลกจากงานกลุ่มนี้

### Patent / trademark agents และ boutique IP practices

**ตลาด:** WIPO filing/class counts ในตารางเป็น global activity proxy; patent applications, trademarks/classes และ renewals ไม่ใช่หน่วยเดียวกัน และอาจมี applicant เดียวกันหลายรายการ. จำนวน independent IP firms ที่ซื้อได้ยัง *unverified*

**Incumbents / pricing:** [AppColl](https://public.appcoll.com/law-firm-product-pricing/) PM Pro US$100/user/month, PM Plus US$130 billed monthly; starting price ครอบคลุม 200 matters ตามหน้า. [Alt Legal](https://www.altlegal.com/pricing/) แสดง $60/month ถึง 50 docketed matters, Trademark Protection เพิ่ม $30/month; unlimited users ตามเงื่อนไข. หน้า `$`/billing term ต้องยืนยันเป็น quote จึงไม่ยกเป็น annual USD comparison ที่ยืนยันแล้ว

**Pains (*inference*):** missed response/renewal dates, foreign associates, duplicated patent-family data, client correspondence และ portfolio reporting. **Transfer:** matter/doc/deadline/calendar/portal/time/billing เกือบครบในระดับ operations. **Gaps:** patent/trademark family, jurisdiction/classes/priority chains, office data feeds, renewal/annuity instructions, associate cost allocation และ rule version/effective dates. **Wedge:** portfolio/client collaboration + internal review ก่อน authoritative global docketing. ต้องมี specialist content/feeds และความรับผิดชอบเมื่อกฎเปลี่ยน; การมี DeadlineRule เดิมไม่ได้ปิดช่องว่างนี้

### Insurance claims / independent และ public adjusters

**ตลาด:** BLS 376,100 jobs รวม insurer/government employees จึงไม่ใช่จำนวน public-adjuster subscribers; แยก auto-damage appraisers ออกจาก proxy นี้. Buyer hypothesis เป็น independent adjusting practice owner/operations (*estimate*) มากกว่า insurer core-platform procurement

**Incumbents / pricing:** [ClaimWizard](https://claimwizard.com/pricing/) Business เริ่ม $250/month รวม 3 assignable licences, เพิ่ม licence $50/month และ office staff accounts ไม่คิดเพิ่มตามเงื่อนไข; Solo $99/month จำกัด public adjuster คนเดียวไม่มี staff. เป็น US-vendor price benchmark ที่หน้าใช้ `$`; ISO currency ต้องยืนยัน quote ไม่สมมติว่าใช้ทั่วโลกได้

**Pains (*inference*):** หลักฐาน/รูป/อีเมลกระจัดกระจาย, ตาม insurer, aging claims, หลายฝ่าย, settlement/fee allocation. **Transfer:** case, docs, tasks/deadlines, portal, billing/audit และ model `InsuranceClaim`/`CargoClaim` เดิม ([insurance claims](../../apps/api/src/insurance-claims), [cargo claims](../../apps/api/src/cargo-claims)). **Gaps:** policy/coverage/loss object, carrier/claim IDs, field photos/offline/geotag, inspection scheduling, estimating/Xactimate links, settlement allocation และ license/fee rules. Existing insurance stage มี `OIC_COMPLAINT`/`SUIT_FILED` จึงเป็น Thai legal-claim workflow มากกว่า adjuster platform ทั่วโลก. เริ่ม claim coordination; ไม่รับแทน estimating/adjudication system

### Architects / engineering consultancies

**ตลาด:** NCARB นับ licensed architects; AIA นับ architecture firms. เป็น US slice คนละหน่วย ไม่ครอบ engineering หรือ global A&E ทั้งหมด. โอกาสที่ตรงคือ professional practice operations ที่มี phases และ time budgets ไม่ใช่ design authoring

**Incumbents / pricing:** [Monograph](https://monograph.com/pricing) ใช้ employee-count calculator; extraction ไม่ยืนยัน unit/commitment ของตัวเลขอย่างปลอดภัย จึงระบุ **current quote required / price unverified** แทนราคา Track/Grow จากบทความเก่า. ใช้ [Scoro current pricing](https://www.scoro.com/pricing/) เป็น public comparison ด้าน time-billing/projects ตามด้านบน ไม่อ้างว่า feature เท่ากันทั้งหมด

**Pains:** [Monograph project tracking](https://monograph.com/features/project-tracking) เปรียบ planned/logged/invoiced hours/fees ตาม phase เพื่อเห็น budget overrun; revision/approval handoff และ utilization เป็น product hypotheses ที่ต้องสัมภาษณ์เพิ่ม. **Transfer:** project/case, milestones/tasks, docs/approvals, timesheets, invoices, workload. **Gaps:** phase/role budgets, cost rates, percent-complete billing, change orders, subconsultant/vendor budgets และ revision/transmittal/RFI links. **Wedge:** client-approval + phase-finance; เชื่อม CAD/BIM ภายนอก ไม่สร้าง CAD/BIM engine

### Recruitment / executive-search agencies

**ตลาด:** [WEC](https://wecglobal.org/publication-post/industry-impact-report-2026/) 61 ล้าน placements ใน 2024 แบ่ง temporary agency work 58.4 ล้าน และ direct recruitment 2.5 ล้านตามค่าปัดเศษของต้นทาง; ไม่ใช้จำนวนคนที่ placed เป็นจำนวน agency หรือ SaaS seats. Executive search เป็น slice ที่ขนาดจริงยัง *unverified* ในรายงานนี้

**Incumbents / pricing:** [Zoho Recruit staffing comparison](https://www.zoho.com/recruit/plan-comparison.html) Standard/Professional/Enterprise US$25/$50/$75 ต่อ recruiter/month annual หรือ $30/$60/$90 monthly; แยก Staffing จาก Corporate edition ([official editions guide](https://help.zoho.com/portal/en/kb/recruit/zoho-recruit-fundamentals/zoho-recruit-editions/articles/staffing-edition-plans)). [Recruit CRM](https://recruitcrm.io/pricing/) แสดง Pro $95, Business $135, Enterprise $215/user/month แต่ extraction ไม่ยืนยัน active billing toggle: term/currency scope *unverified* จนตรวจ quote; ไม่เสนอเป็น annual offer ที่ยืนยันแล้ว

**Pains (*inference*):** candidate/client/job duplication, CV search, interview feedback, consent/retention, placement fee/guarantee และ contractor timesheets. **Transfer:** intake/contacts/portal/docs/workflow/calendar/billing. **Gaps:** candidate↔job many-to-many pipeline, CV parsing/dedup/search, job-board/sourcing integrations, hiring-manager feedback, commissions/placement guarantees และ candidate-specific retention. **Wedge:** executive-search engagement coordination อาจทดสอบได้; broad ATS replacement ต้องสร้าง core ใหม่มากและมี switching cost ด้าน data/integrations จึงยังไม่ใช่กลุ่มแรก

### ทำไมยังไม่เลือกอีกบางกลุ่ม

Notaries, property managers, healthcare administration และ debt collection ยังไม่อยู่ใน shortlist แรกเพราะ country-specific authority/registration, property/lease accounting, clinical/health-data obligations หรือ collections conduct/portfolio integrations เพิ่มแกนเฉพาะทาง (*assessment / ยังไม่ได้ทำ market-sizing เทียบเท่า 7 กลุ่มข้างบน*). ไม่สรุปว่าไม่มีตลาดหรือซื้อไม่ได้; การเลือกกลุ่มเหล่านี้ต้องทำ discovery แยก และไม่ใช้ prior Thai AMC research เป็นหลักฐาน global product fit

## Q2: Horizontal features / add-ons และหลักฐานการจ่ายเงิน

### Legal / horizontal reference points ที่ต้องเทียบให้ตรงรุ่น

- [Clio live US/Global pricing](https://www.clio.com/pricing/) ปัจจุบัน Starter/Core/Signature/Elite และเปิดราคาเริ่ม **US$49/user/month** เท่านั้น; tier สูงกว่าต้อง Get pricing. AI อยู่ Core ขึ้นไป; Signature เพิ่ม reporting/permissions/multiple currencies; Elite รวม Grow intake/scheduling. หน้าไม่ได้ยืนยัน annual/monthly ของ starting price อย่างชัดในข้อความที่ตรวจ จึงไม่เอา grid EasyStart/Essentials/Advanced/Expand รุ่นเก่ามาใช้เป็น current quote หรือแต่ง add-on price
- [monday live pricing](https://monday.com/pricing) ที่เปิดจากบริบทการค้นครั้งนี้แสดง **¥1,300 Basic / ¥1,650 Standard / ¥3,200 Pro ต่อ seat/month billed annually สำหรับ 10 seats**. เป็น regional display พร้อม promotion/credits; ISO currency/offer eligibility ต้องยืนยัน ไม่แทนด้วย USD จาก search snippet. ความแตกต่างของ quota automation/integration/AI เป็น packaging evidence; ไม่ใช่ค่า professional-services portal/billing ทั้งชุด
- **TaxDome drift ที่คลี่คลายได้:** direct pricing และ [current subscription guide](https://help.taxdome.com/article/subscription-overview) สอดคล้องเรื่อง client-based cohorts หลัง 2 November 2026; old help/search snippets ยังแสดง seat tiers. ต้องผูก quote กับประเทศและวันที่เริ่มใช้ ไม่เฉลี่ยราคาสองระบบเข้าด้วยกัน

### หลักฐาน pricing และช่องทาง monetization

ทุกแถวเป็น snapshot วันที่ตรวจค้น; USD/US เว้นแต่ระบุ. “ไม่เปิดเผย” ในคอลัมน์ attach หมายถึง **ไม่พบ numerator/denominator ของ paid add-on ใน primary sources ที่ตรวจ — *unverified*** ไม่ได้หมายถึง attach เป็นศูนย์

| Feature / buyer | ใครขายและ price point | แพ็กอย่างไรสำหรับ Samnuan (*recommendation / estimate*) | Paid attach evidence |
|---|---|---|---|
| AI agents / Copilot: ทีมเอกสารและ client ops | [Freshdesk](https://www.freshworks.com/freshdesk/pricing/) Copilot $29/agent/month เพิ่มจาก Pro/Enterprise; additional AI Agent sessions $49/100 sessions; [HubSpot Credits](https://www.hubspot.com/products/artificial-intelligence/credits?re=true) $0.010/credit, 50 credits/$0.50 ต่อ resolved Customer Agent conversation | user-approved document/intake assistant, quota + cost cap; อย่านับ professional decision ว่า resolved เพียงเพราะ AI ตอบได้ | Freshworks มี cohort evidence ด้านล่าง; HubSpot usage ไม่เท่ากับจ่าย overage |
| AI operations แบบ firm bundle | [TaxDome AI](https://help.taxdome.com/article/ai-add-on) $200/firm/month รวม document operations/API/MCP; Atlas ระบุ coming soon ใน help; [Karbon AI](https://karbonhq.com/feature/ai) ไม่มีค่าเพิ่มปัจจุบัน | ต้องทดสอบว่าลูกค้าจะจ่ายเพิ่มหรือคาดว่า AI อยู่ในแผน; แยก shipped feature จาก roadmap | ไม่เปิดเผย |
| eSignature / identity | [Karbon](https://karbonhq.com/pricing/) 100/$100, 500/$450, 1,000/$800 credits; signature request=1 credit, KBA=2; engagement letters ไม่กิน credits | bundle basic envelope quota + ซื้อเพิ่ม; เก็บ signed artifact, version/hash, signer evidence และ provider webhooks | ไม่เปิดเผย |
| Intake / engagement conversion | [PracticePanther](https://www.practicepanther.com/pricing/) Business $89/user/month annual รวม intake, unlimited native eSign, texting, revenue report; Essential $69 เป็นราคาทั้ง tier | Growth tier สำหรับ conditional intake + requested docs + follow-up; tier uplift ไม่ใช่ราคา standalone intake | ไม่เปิดเผย |
| Client portal + payments | [Canopy](https://www.getcanopy.com/pricing/) Standard $74/user/month annual; US card 3.30%+$0.20 และ ACH 1% cap $10; [PracticePanther](https://www.practicepanther.com/pricing/) portal ทุกแผน | core portal + paid collection automation; transaction fee ต้องแยก provider fee, platform margin, refund/chargeback liability | ไม่เปิดเผย; GMV ไม่ใช่ attach |
| Scheduling / prepaid consultation | [Calendly](https://calendly.com/pricing/?at=1) Standard $10/seat/month annual พร้อม Stripe/PayPal; Teams $16 เพิ่ม routing/round-robin | เชื่อม booking → intake → deposit; reuse availability/Outlook ก่อนทำ routing engine ใหม่ | ไม่เปิดเผย |
| Secure messaging | Canopy Standard และ PracticePanther ทุกแผนมี secure portal; native texting ของ PracticePanther อยู่ Business ([Canopy](https://www.getcanopy.com/pricing/), [PracticePanther](https://www.practicepanther.com/pricing/)) | secure portal ใน core; SMS/WhatsApp คิด usage เมื่อมีประเทศ/provider/consent ที่รองรับ | ไม่เปิดเผย |
| Document / proposal automation | [PandaDoc](https://support.pandadoc.com/en/articles/9715033-compare-subscription-plan-features) Starter $19 annual/$35 monthly, Business $49 annual/$65 monthly ต่อ user/month; Business เพิ่ม CRM/branding/approvals | merge fields + review + generated document; ไม่ตีความ user-plan unlimited เป็น unlimited API/OEM rights | ไม่เปิดเผย |
| Advanced document builder / white-label | [Gavel](https://www.gavel.io/pricing) Lite เริ่ม $83/month, Pro $290/month มี custom domain/white-label; Standard บน card กับตารางไม่ตรงกันจึงไม่ใช้เป็น benchmark | จำกัด template language และ pack ที่ดูแลได้; provider cost/OEM licensing ต้องตรวจเพิ่ม | ไม่เปิดเผย |
| Workflow templates / marketplace | [Karbon template library](https://karbonhq.com/templates/) ฟรี; Gavel รวม templates ใน paid plan | ขาย outcome/setup/maintained profession packs; curated library เพื่อ activation ก่อนสร้าง marketplace, seller payouts, moderation | ไม่พบหลักฐาน paid marketplace attach |
| Deadline / compliance calendar | [LawToolBox](https://lawtoolbox.com/pricing/) 2–9 users $39/user/month annual หรือ $46 monthly; ตรวจ commitment และ rule jurisdiction ก่อนซื้อ | specialist maintained rule pack / annual content subscription; calendar/reminder ทั่วไปอยู่ core | ไม่เปิดเผย |
| Reporting / capacity | [Canopy](https://www.getcanopy.com/pricing/) Plus $109/user/month annual เพิ่ม capacity/custom reporting จาก Standard $74; Karbon custom reporting บาง tier เป็น paid add-on ไม่เปิดราคา | WIP, realization, receivable aging, utilization, margin/report exports ก่อน BI builder | ไม่เปิดเผย |
| Integrations / API / MCP | [Freshdesk](https://www.freshworks.com/freshdesk/pricing/) MCP $15/1,000 actions และ connectors $80/5,000 tasks; TaxDome API/MCP รวม AI bundle | basic import/export + key connector เป็น adoption path; high-volume governed access เป็น add-on | ไม่เปิดเผย |
| White-label portal | [SuiteDash](https://suitedash.com/pricing/) Start $19/month หรือ $180/year รวม white-label/PWA/unlimited staff/portals; Thrive $49/month เพิ่ม chat/proposals; Pinnacle $99 เพิ่ม automation | custom domain/brand/control มีราคาแข่งขันต่ำ; ขายกับ workflow/client experience ไม่หวัง premium จาก logo removal อย่างเดียว | ไม่เปิดเผย |
| Security / enterprise controls | [Calendly](https://calendly.com/pricing/?at=1) Enterprise เริ่ม $15,000/year ที่ 50 seats; governance/SSO/audit เป็น enterprise package, Teams มี SSO add-on ไม่เปิดราคา | ขาย SSO/admin/SLA/support ตามความต้องการ; baseline security, lawful processing และ deletion ไม่ควรเป็นสิ่งที่ละเว้นในแผนถูก | ไม่เปิดเผย |
| Data residency | [monday residency](https://support.monday.com/hc/en-us/articles/4404392703250-Data-residency-where-your-data-is-stored) EU storage ไม่จำกัดเฉพาะ Enterprise; EU Enterprise ขยาย residency coverage รวม subprocessors ตามเงื่อนไข | region selection และ contractual scope ต้องชัด; ไม่อ้างว่าเลือก EU DB แล้วทุก service อยู่ EU | ไม่เปิดเผย |

**อย่าใช้ feature roadmap เป็นสินค้าที่เปิดขายแล้ว:** Canopy Coworker เป็น Open Beta; Premium $149/user/month annual เป็น coming soon บน [pricing](https://www.getcanopy.com/pricing/). Calendly Callie เป็น Beta/optional Plus ตาม [pricing](https://calendly.com/pricing/?at=1). TaxDome Atlas marketing และ help มี maturity language ต่างกัน จึงไม่ถือว่า availability ครบทุก cohort ได้จาก homepage

### Attach rate: อะไรพิสูจน์ได้และอะไรยังพิสูจน์ไม่ได้

- **Paid add-on cohort ที่พบจริง:** [Freshworks Q4 2025 earnings transcript, 10 February 2026](https://ir.freshworks.com/files/doc_earnings/2025/q4/transcript/Transcript-Q4-2025.pdf) หน้า 5 ระบุ Freddy AI Copilot attach **มากกว่า 50%** ในลูกค้า **ARR มากกว่า US$30,000**; Q&A หน้า 12 อธิบาย larger new-business deals และแยก revenue จาก AI SKU ที่ขายจริงออกจาก AI ที่ bundled. เป็น vendor-reported enterprise/service-software cohort ไม่ใช่ attach ทุกลูกค้า ไม่ใช่ accounting/immigration SMB และใช้ตั้ง forecast ของเราไม่ได้
- **Revenue/adoption ที่ไม่ใช่ attach:** [monday Q3 2026 results](https://ir.monday.com/news-and-events/news-releases/news-details/2026/monday-com-Announces-Third-Quarter-2026-Results-new/default.aspx) ระบุ AI ARR US$36 million โดยรวม allocated value ของ bundled AI credits; จึงไม่ใช่ standalone add-on ARR ทั้งหมด. [HubSpot Q2 2026 transcript](https://ir.hubspot.com/static-files/f868efed-4a81-4a8b-b0c9-a68cde86a345) พูดถึง agent adoption ใน Pro+ จาก high-single digits เป็น mid-teens ไม่ได้ยืนยัน paid-overage attach
- **ตัวอย่าง demand signal แยกจาก attach:** [Clio 2026 report release](https://www.clio.com/about/press/2026-legal-trends-report/) ระบุ 85% ของ legal professionals รายงานการใช้ AI บางระดับที่สำนักงาน เป็น survey/adoption ในตลาด legal ไม่ใช่เปอร์เซ็นต์คนซื้อ Clio AI add-on และไม่ใช้แทน non-legal demand
- **ช่องว่างหลักฐาน:** ไม่พบ public paid attach rate ที่นิยามชัดสำหรับ add-ons อื่นในตาราง. Feature inclusion, usage, active accounts, customer logos, signed documents และ payment volume ใช้แทนตัวตั้ง/ตัวหารของคนที่จ่ายไม่ได้. ควรเก็บ cohort ของเราเอง: paid firms with add-on ÷ eligible paying firms, พร้อมสิทธิ์ที่ bundle อยู่แล้วและช่วงเวลาชัดเจน; ยังไม่มีข้อมูลจริงจึงไม่ใส่ target attach แบบดูเหมือนสถิติ

## Q3: Go-global checklist

### เงิน ภาษี และ payment rails

| Checklist | ข้อกำหนด / หลักฐาน | ผลต่อการเปิดขาย |
|---|---|---|
| แยกสอง money flows | ค่าสมาชิก Samnuan กับค่าบริการที่ firm เรียกเก็บจาก client ต่าง legal seller/ledger; [Stripe Managed Payments eligibility](https://docs.stripe.com/payments/managed-payments/eligibility) จำกัด digital products ไม่ครอบ professional services/Connect ตามเงื่อนไข | ห้ามใช้ MoR ของ SaaS แทนผู้ขายบริการบัญชี/consulting ของลูกค้าโดยอัตโนมัติ; กำหนด dispute/refund/tax owner |
| เลือก PSP / MoR / entity | [Stripe global](https://stripe.com/global) รองรับ Thailand; [Managed Payments](https://docs.stripe.com/payments/managed-payments) และ [eligibility](https://docs.stripe.com/payments/managed-payments/eligibility) มี business-location/product review และรายการที่ตรวจยังไม่รวม Thai entity | เริ่มสมมติฐาน PSP + tax process สำหรับ Thai seller; MoR ต้องตรวจ eligibility หรือผู้ให้บริการอื่น ไม่สร้าง entity ใหม่โดยไม่มี business case |
| Multi-currency | [Stripe currencies](https://docs.stripe.com/currencies) แยก presentment/settlement และ zero-decimal/special rules | explicit ISO currency ต่อ invoice/payment/price, Decimal/minor-unit policy, tax rounding, historical FX และ reconciliation; อย่าใช้จำนวนเงินเดียวกับ currency ที่เปลี่ยนตาม UI |
| Tax/VAT lifecycle | [Stripe Tax](https://docs.stripe.com/tax/how-tax-works) ช่วย monitor/calculate/collect แต่ registration/filing/remittance ต้องมี process/บริการที่เลือก | เก็บ billing location, business status, tax ID validation, product tax code, evidence, invoice/credit note และ registration status; ไม่เขียนว่าเปิด Stripe Tax แล้วภาษีเสร็จทั้งหมด |
| Stripe Tax economics | [US pricing](https://stripe.com/tax/pricing) Basic no-code 0.5% ต่อ transaction ตามเขตที่ registered; API US$0.50/transaction ตามเงื่อนไข | เป็น tax-service fee เพิ่มจาก processing; ไม่ใช่อัตราสำหรับทุกประเทศหรือคำยืนยันว่า filing รวมทั้งหมด |
| EU VAT | [EU OSS](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/register-oss_en) non-Union ใช้กับ non-EU seller ขาย services ให้ non-taxable persons; [cross-border VAT](https://europa.eu/youreurope/business/finance-and-tax/vat/cross-border-vat/) อธิบาย B2B reverse charge โดยมีข้อยกเว้น | แยก B2B/B2C และตรวจสถานะจริง; solo professional ไม่ได้แปลว่า tax-exempt; ให้ tax adviser ยืนยันตาม entity/country ก่อนขาย |
| Local payment matrix | [Stripe method support](https://docs.stripe.com/payments/payment-methods/payment-method-support) แสดง ACH/Bacs/AU BECS/SEPA/PayNow/PromptPay ต่าง seller country, currency, recurring/refund capability | เตรียม country × seller entity × currency × recurring matrix; cards ที่ใช้ได้ทั่วโลกไม่เท่ากับทุก local rail เปิดจาก Thai account ได้ |
| PromptPay / recurring | matrix เดียวกันไม่รองรับ future-use setup แบบบัตร; subscription/invoice รองรับเฉพาะ `send_invoice` ตามเงื่อนไข | ใช้ pay-per-invoice + reminder; ห้ามสัญญา auto-debit recurring PromptPay |
| Embedded client payments | [Stripe Connect](https://docs.stripe.com/connect) เป็นแยก integration สำหรับ platform/connected accounts; subscription checkout ที่มีไม่ยืนยัน onboarding/payout readiness | ต้องมี firm merchant onboarding/KYC, platform liability, regional availability, webhook/reconciliation/refund และ test flows ก่อนคิด transaction revenue |

### i18n, data residency และ trust

| Checklist | ข้อพิจารณาที่มีแหล่ง | สิ่งที่ควรมีเมื่อ launch |
|---|---|---|
| Locale ≠ timezone ≠ jurisdiction | [W3C timezone draft note](https://www.w3.org/TR/timezone/) และ [internationalization guidance](https://www.w3.org/International/articles/intl/index.en.html); draft ไม่ใช่ normative Recommendation | firm/user language และ timezone, date-only deadline, DST recurring scheduling, currency/tax jurisdiction แยก field/behavior; English ทั้ง web/mobile/email/docs/API errors |
| EU / US / APAC residency | [EDPB transfers](https://www.edpb.europa.eu/sme/be-compliant/international-data-transfers_en) พิจารณาการเปิดข้อมูลให้ organisation นอก EEA ไม่ใช่ที่ตั้ง DB อย่างเดียว | เลือก initial home region ตาม paid pilots; map DB/object/backups/logs/AI/email/support/subprocessors; เพิ่ม region เมื่อมีเหตุซื้อจริง; ไม่อ้างว่า US/APAC เป็น jurisdiction เดียว |
| GDPR contracts / rights | [EDPB](https://www.edpb.europa.eu/sme/be-compliant/international-data-transfers_en), [EC SCC Q&A](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/new-standard-contractual-clauses-questions-and-answers-overview_en) | DPA, controller/processor roles, subprocessor notices, lawful transfer mechanism/TIA ตามกรณี, retention/export/deletion และ audit; EU hosting ไม่เท่ากับ GDPR compliance |
| Breach response | [EDPB breach obligations](https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en): processor แจ้ง controller โดยไม่ชักช้า; controller มีกรอบ 72 ชั่วโมงต่อ regulator เมื่อเข้าเงื่อนไข | มี incident escalation/contact/logging และช่วยลูกค้าสืบค้น; อย่าอธิบายว่า processor มีเวลา 72 ชั่วโมงเสมอ |
| SOC 2 | [AICPA SOC suite](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services) เป็น assurance reporting โดย CPA | เก็บ controls/evidence, tenant isolation, access reviews, change/incident/vendor management, restore evidence; ห้ามเรียก SOC 2 ว่า certificate หรืออ้างว่ามีแล้วจาก code |
| ISO/IEC 27001 | [ISO/IEC 27001:2022](https://www.iso.org/standard/27001) เป็น ISMS standard | เตรียม scope/risk management/controls และเลือก certification ตาม buyer; ไม่มีหลักฐานว่าทุก SMB ต้องการทั้ง ISO และ SOC 2 หรือ audit จะแทน GDPR ได้ |
| eSignature assurance | [European Commission eSignature guidance](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467109069/What%2Bis%2BeSignature) แยก simple/advanced/qualified; QES มีผลเทียบ handwritten ทั่ว EU ตามกรอบที่อธิบาย | ระบุ signature level และตรวจ document/jurisdiction requirements; native eSign หรือ KBA ไม่ใช่คำรับรองว่าเป็น QES หรือใช้ได้กับทุก government form |
| AI confidentiality | [EDPB transfer guidance](https://www.edpb.europa.eu/sme/be-compliant/international-data-transfers_en) ใช้กับ processor/transfer chain รวม AI | ระบุ vendor/region/retention/training terms, opt-in/consent ตามกรณี, redaction, per-tenant access, prompt injection boundary, human review และ usage logs; คง user-invoked policy ของ product |

### Mobile distribution และการขาย

- **Apple:** [App Review Guidelines §3.1.3(c)](https://developer.apple.com/app-store/review/guidelines/) ยอม employee access ไปยัง subscription ที่องค์กรซื้อ แต่ consumer/single-user/family sales ต้อง IAP ตามข้อนี้. §3.1.3(f) มีแนวทาง free companion app ของ paid web tool โดยมีเงื่อนไข; storefront และ external-link exceptions ต่างกัน. ดังนั้น “เป็น B2B” ไม่ใช่ exemption อัตโนมัติ โดยเฉพาะ solo practitioner; ออกแบบ login/consumption-only และตรวจ storefront/CTA จริงก่อน submission
- **Google Play:** [Payments policy explanation](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en) ครอบ cloud business productivity; consumption-only app ให้ login ใช้บริการที่จ่ายข้างนอกได้ แต่ in-app purchase/upgrade links ต้องพิจารณานโยบายและ regional programs. เงินที่ client จ่ายให้บริการวิชาชีพกับเงินซื้อ digital SaaS เป็นคนละกรณี ต้องแยก UI/flow
- **PLG vs sales-led:** [Clio signup](https://www.clio.com/signup/) มี 7-day no-card trial; [TaxDome current registration](https://help.taxdome.com/article/72-firm-registration) ชี้ contact-sales/demo และ [onboarding](https://taxdome.com/onboarding) มี paid onboarding เริ่ม US$999; [Karbon pricing/implementation](https://karbonhq.com/pricing/) มี guided implementation. เป็นหลักฐานว่า self-serve discovery กับ assisted migration อยู่ร่วมกัน ไม่ใช่ controlled evidence ว่ารูปแบบหนึ่งมี conversion ดีกว่า
- **ข้อเสนอ GTM (*estimate / inference*):** product-led acquisition ด้วย profession demo/sample pack/portal preview; assisted activation ด้วย CSV import และ workflow setup; ให้จ่ายเพื่อ migration ที่ลดเวลาจริง. เริ่ม self-serve trial เมื่อผู้ใช้ทำ workflow จบเองได้ ไม่ใช่เพราะคู่แข่งเคยมี trial. ให้ specialist association/accounting ecosystem เป็น channel hypothesis และทดสอบ CAC/payback ภายหลัง; ยังไม่มี CAC, LTV หรือ conversion benchmark ที่ยืนยันสำหรับเรา
- **Launch gate (*proposed / estimate*):** ประเทศ/ผู้ขาย/region/terms ที่เลือกชัด; English end-to-end; access/export/delete/backup-restore checks; tax/payment reconciliation ที่ทดสอบจริง; regulated template owner; app-store model reviewed. ไม่มีส่วนใดในรายงานนี้เป็นหลักฐานว่าผ่าน gate แล้ว

## Q4: Architecture fit และจุดที่ผูกกับงานกฎหมาย

**ข้อเสนอเชิงแนวคิด:** ใช้ core เดิม แล้วเพิ่ม profession configuration และ country packs ทีละส่วน ไม่ต้อง rename ทุก table หรือทำ generic entity platform ก่อนมีลูกค้าจ่าย. ข้อเสนอและ effort ในส่วนนี้เป็น *estimate* ไม่ใช่ implementation spec

| สิ่งที่ต้องเปลี่ยน | หลักฐานว่าปัจจุบันผูกกับกฎหมาย | แนวทางที่เล็กพอสำหรับ wedge |
|---|---|---|
| Terminology packs | [CONTEXT.md](../../CONTEXT.md) กำหนด working staff ทุกคนเป็น Lawyer; Case Owner, court roles; [root layout](../../apps/web/src/app/layout.tsx) มี title/metadata/`lang=th` | แยก permission/capability จากคำที่แสดง; legal=Case/Lawyer, accounting=Engagement/Accountant, immigration=Application/Consultant; tenant เลือก profession โดยไม่เปลี่ยนสิทธิ์เพราะเปลี่ยนคำ |
| Configurable matter types / lifecycle | `CaseType.fieldSchema` และ `Case.customFields` มีแล้ว แต่ `CaseStage`, `CaseOutcome`, `ParticipantRole`, `DeadlineTrigger` เป็น enum เฉพาะกฎหมายใน [schema](../../apps/api/prisma/schema.prisma) | ใช้ CaseType เป็นฐาน เพิ่ม stage/participant definitions ที่ตรวจสอบได้ต่อ pack; คง legacy legal mapping และปิด court-only fields ใน vertical อื่น; ซ่อน UI อย่างเดียวไม่พอถ้า API ยังบังคับค่า |
| Owner และความสัมพันธ์ | `Case.leadLawyerId` บังคับ; plaintiff/defendant/represented client ต่างจาก payer; ดู [schema](../../apps/api/prisma/schema.prisma) | UI/API facade ใช้ owner ที่อ้าง user เดิม; คงการแยก payer/contact/subject; household หรือ candidate ต้องเป็นความสัมพันธ์ที่ชัดเจน ไม่ยัด PII ทั้งหมดลง notes |
| Custom field contracts | `fieldSchema`/`customFields` เป็น Json ใน [schema](../../apps/api/prisma/schema.prisma) | เพิ่มชนิดข้อมูล validation/version, permissions, export/search semantics ก่อนเพิ่ม form builder; ไม่อ้างว่ามี typed cross-vertical reporting แล้วจากการมี Json |
| Template packs | [practice setup](../../apps/api/src/practice-setup/practice-setup.service.ts) import `CaseStage`, Thai labels, cargo playbooks และ lawyer roles; [template variables](../../apps/api/src/templates/templates.service.ts) คิด plaintiff/defendant/court levels | curated versioned packs: intake fields → document checklist → tasks/review → client update → deliverable; schema/version/locale/jurisdiction มี owner; เริ่มขาย pack ที่ทีมดูแลก่อน marketplace เปิดให้คนทั่วไป |
| Deadline engine / country packs | `DeadlineTrigger` เน้น court/service/judgment; `Court` เป็น shared Thai catalog, `PublicHoliday` และ digest อ้าง Bangkok; [deadline rules](../../apps/api/src/deadlines/deadline-rules.service.ts) | แยก trigger vocabulary, business calendar, timezone และ jurisdiction; เก็บ effective date/source/version/override; human-confirmed deadline เสมอเมื่อเป็นข้อเสนอ AI; งานเปลี่ยนกฎหมายมี maintenance cost |
| International money | `BillingInvoice.currency` default THB แต่ client `Invoice.totalAmount`, payments, time rate/expense ใช้ Float และ client Invoice ไม่มี currency; [subscription service](../../apps/api/src/saas/subscription.service.ts) checkout/add-on หลายจุด hard-code `thb` | แยก subscription billing จาก client receivables; explicit currency, minor-unit/Decimal strategy, tax lines/tax IDs, rounding, credit notes, FX snapshots; ห้ามนำค่าเดิมไปตีความเป็น USD อัตโนมัติ |
| i18n ทั้ง product | `LocaleProvider` อยู่ใต้ landing components; [template service](../../apps/api/src/templates/templates.service.ts) ใช้ `th-TH`/`Asia/Bangkok`; [Bangkok utility](../../apps/api/src/common/utils/bangkok-time.ts) และ CONTEXT กำหนด reference ตาม Bangkok year | ตรวจ API errors, web/mobile/email/PDF/DOCX/notification/search/import ด้วย; tenant locale/timezone กับ user locale แยกกัน; dates แบบ all-day แยกจาก instant; รักษา legacy ref และลำดับ unique |
| Integration boundary | Outlook, MCP และ Stripe มี module แล้ว; ไม่พบเหตุให้สรุปว่า native QuickBooks/Xero/USCIS/e-filing พร้อมจาก inventory นี้ | เพิ่ม connector เฉพาะที่ pilot ใช้; OAuth scopes, retry/idempotency, webhook validation, consent/revocation และ audit ต่อ tenant; ห้ามให้ connector ข้ามสิทธิ์เดิม |
| Region / trust | `firmId`, access guards, object storage และ logs เป็นฐาน แต่ inventory ไม่ยืนยัน multi-region หรือ certification | กำหนด tenant home region ครอบ DB/object/search/AI/logs/backups/support access; DPA/subprocessor inventory; ทดสอบ restore และ tenant isolation ก่อนขาย assurance |

ลำดับ dependency แบบ *estimate*: terminology + typed pack + locale/region decision → first client-document workflow → billing/integration เฉพาะตลาด → advanced rules/AI. เก็บ legal API compatibility และ migration mapping; ไม่มีเหตุให้เปลี่ยน monorepo frameworks หรือสร้าง microservices จากงานวิจัยนี้

## Open questions

| คำถามที่ยังต้องตอบ | หลักฐาน/ผู้รับผิดชอบที่ต้องมี | ผลต่อการตัดสินใจ |
|---|---|---|
| Accounting เริ่มประเทศใดและ bookkeeping/close หรือ tax season? | Founder + paid design partners; installed tools และ document-request baseline | กำหนด tax calendar, currency, region และ connector แรก; ไม่เริ่มหลาย tax regimes พร้อมกัน |
| หา Canadian RCIC partner ที่ดูแล content/version ได้หรือไม่? | Licensed partner + approved sample workflows + scope/authority review | ถ้าไม่ได้ ให้ fallback compliance consultants; ไม่แกล้งใช้ US forms แทน Canada |
| ลูกค้าซื้อเพราะ chasing/portal หรือ integration เป็นเงื่อนไขซื้อ? | Offer/interview และ pilot conversion จริง | อาจต้องลงทุน QuickBooks/Xero ก่อน eSign/AI; source fit ไม่เท่ากับ switching fit |
| Firm-level, staff seat หรือ active client เป็น metric ที่ลูกค้ารับได้? | ทดสอบ offer จริง; บันทึก eligible accounts/staff/usage/support | TaxDome เปลี่ยน metric แล้ว จึงไม่ควร lock pricing จาก seat-only benchmark |
| Willingness-to-pay / CAC / retention / add-on attach ของเราเท่าไร? | Paid cohorts, renewals, churn reasons, unit AI/storage/support costs | ทั้งหมดยัง *unverified*; ไม่ใส่ invented ARR/TAM/attach forecast |
| Seller entity / PSP / MoR และ taxes ประเทศแรก? | Finance/tax counsel + merchant contract/eligibility | ชี้ว่ารองรับ rail ใดและใคร liable; report ไม่ใช่ entity-specific tax opinion |
| ขอบเขต residency ที่ลูกค้าต้องการคือ storage หรือทุก processor? | Customer DPA/security questionnaire + vendor commitments | ระบุ single-region launch/transfer safeguards และต้นทุน region เพิ่ม; ไม่มี certification ที่พิสูจน์จาก inventory |
| eSign provider/OEM rights และ signature level ตรงเอกสารหรือไม่? | Provider quote, API/OEM terms, local professional review | ค่า per-user ไม่แทน API redistribution price; อาจต้อง identity/QES แยก |
| ข้อมูลเก่าและ mobile/web ใช้ timezone/ภาษาเดียวกันหรือไม่? | Scoped implementation audit + E2E/export samples ภายหลัง | ประเมิน migration effort จริง; รายงานนี้อ่าน source บางจุด ไม่รับรอง i18n/security ทั้งระบบ |
| ขนาดตลาด firms ที่เข้าถึงจริงในแต่ละประเทศ? | Registries/association lists + firm-size/installed-tool sample | ตัวเลข jobs/filings/placements ยังใช้เป็น reachable SAM/SOM ไม่ได้; Global TAM ยัง *unverified* |

## ข้อสังเกตสำหรับ controller / handoff

- สร้าง skeleton ก่อนค้นคว้าลึก แล้วเติมรายงานไฟล์เดียว; ไม่มีการแก้ application code หรือ commit
- source inventory เป็นการอ่าน schema/module และไฟล์เฉพาะจุด ไม่ใช่ runtime, security audit หรือ production verification
- ไม่ได้ส่งข้อความหาลูกค้า สมัคร trial ซื้อ subscription หรือส่งข้อมูลจริงเข้า vendor ใด; งาน background agents เป็นการค้นข้อมูลและคืนหลักฐานให้ผู้เขียน
- ข้อค้นพบที่ควรเฝ้าดู: pricing/plan pages เปลี่ยนระหว่างรุ่นและภูมิภาค; final recommendation ต้องแยก public price, legacy cohort, feature usage และ paid attach rate
- TaxDome เปลี่ยน new-customer pricing metric ใน November 2026; Clio เปลี่ยน plan names และเปิดราคาเพียง starting point; Canopy มี coming-soon tier; Monograph/Recruit CRM มี calculator/toggle ที่ extraction ยืนยันเงื่อนไขไม่ครบ และ monday แสดง regional currency ต่างจาก search snippet
- คำแนะนำที่ส่งต่อ: accounting เป็น primary wedge, Canadian RCIC เป็น secondary แบบมี content-owner gate; ราคา/KPI ของเราเป็นข้อทดลอง ไม่ใช่ผลสำรวจ willingness-to-pay
- ตรวจความครบถ้วนของโครงสร้าง ตารางอันดับ สูตรคะแนน และ local source links; ไม่มี build/tests/checkout/app-store submission หรือ merchant/compliance audit ในงานวิจัยนี้

## Sources

ตรวจค้น 2026-11-14; ลิงก์ inline ระบุ claim ที่รองรับไว้แล้ว. แหล่งราคาเป็น public snapshots ไม่ใช่ signed quotes; Sources บางรายการใช้เพื่ออธิบายข้อจำกัดหรือ roadmap ไม่ใช่รับรอง availability. ไม่มีการใช้ market-report CAGR หรือ TAM ที่ไม่มีวิธีนับชัด

### Market-size proxies / professional authority

- [CICC](https://college-ic.ca/ICCRC/Assets/Documents/AnnualReport/2026_Annual_Report/Annual-Report-2026-College.pdf)
- [BLS](https://www.bls.gov/ooh/business-and-financial/accountants-and-auditors.htm)
- [BLS](https://www.bls.gov/ooh/business-and-financial/management-analysts.htm)
- [WIPO patents](https://www.wipo.int/web-publications/world-intellectual-property-indicators-2025-highlights/en/patents-highlights.html)
- [trademarks](https://www.wipo.int/web-publications/world-intellectual-property-indicators-2025-highlights/en/trademarks-highlights.html)
- [BLS](https://www.bls.gov/ooh/business-and-financial/claims-adjusters-appraisers-examiners-and-investigators.htm)
- [NCARB](https://www.ncarb.org/press/the-number-of-us-architects-rose-6-2025)
- [AIA](https://www.aia.org/aia-architect/article/latest-insights-2024-firm-survey-report)
- [WEC](https://wecglobal.org/publication-post/industry-impact-report-2026/)
- [OMARA](https://www.mara.gov.au/about-us/what-we-do)

### Vendor pricing / packaging / adoption evidence

- [Karbon](https://karbonhq.com/pricing/)
- [PracticePanther](https://www.practicepanther.com/pricing/)
- [TaxDome](https://help.taxdome.com/article/subscription-overview)
- [Canopy](https://www.getcanopy.com/pricing/)
- [PandaDoc](https://support.pandadoc.com/en/articles/9715033-compare-subscription-plan-features)
- [Freshdesk](https://www.freshworks.com/freshdesk/pricing/)
- [TaxDome AI](https://help.taxdome.com/article/ai-add-on)
- [Karbon AI](https://karbonhq.com/feature/ai)
- [LawToolBox](https://lawtoolbox.com/pricing/)
- [Intuit survey](https://quickbooks.intuit.com/r/small-business-data/accountant-tech-survey-2025/)
- [official release](https://investors.intuit.com/news-events/press-releases/detail/1263/accountants-embrace-ai-and-strategic-advisory-services-to-fuel-growth-yet-continue-to-face-tech-and-talent-barriers-according-to-2025-intuit-quickbooks-survey)
- [Karbon อธิบายโดยตรง](https://karbonhq.com/resources/technology-and-modern-accounting-client-chase/)
- [Docketwise](https://www.docketwise.com/pricing/)
- [official help](https://supportcenter.docketwise.com/en/articles/9372148-docketwise-pricing)
- [Migration Manager](https://www.migrationmanager.com.au/pricing/)
- [Scoro](https://www.scoro.com/pricing/)
- [SuiteDash](https://suitedash.com/pricing/)
- [HubSpot Credits](https://www.hubspot.com/products/artificial-intelligence/credits?re=true)
- [AppColl](https://public.appcoll.com/law-firm-product-pricing/)
- [Alt Legal](https://www.altlegal.com/pricing/)
- [ClaimWizard](https://claimwizard.com/pricing/)
- [Monograph](https://monograph.com/pricing)
- [Monograph project tracking](https://monograph.com/features/project-tracking)
- [Zoho Recruit staffing comparison](https://www.zoho.com/recruit/plan-comparison.html)
- [official editions guide](https://help.zoho.com/portal/en/kb/recruit/zoho-recruit-fundamentals/zoho-recruit-editions/articles/staffing-edition-plans)
- [Recruit CRM](https://recruitcrm.io/pricing/)
- [Clio live US/Global pricing](https://www.clio.com/pricing/)
- [monday live pricing](https://monday.com/pricing)
- [Calendly](https://calendly.com/pricing/?at=1)
- [Gavel](https://www.gavel.io/pricing)
- [Karbon template library](https://karbonhq.com/templates/)
- [monday residency](https://support.monday.com/hc/en-us/articles/4404392703250-Data-residency-where-your-data-is-stored)
- [Freshworks Q4 2025 earnings transcript, 10 February 2026](https://ir.freshworks.com/files/doc_earnings/2025/q4/transcript/Transcript-Q4-2025.pdf)
- [monday Q3 2026 results](https://ir.monday.com/news-and-events/news-releases/news-details/2026/monday-com-Announces-Third-Quarter-2026-Results-new/default.aspx)
- [HubSpot Q2 2026 transcript](https://ir.hubspot.com/static-files/f868efed-4a81-4a8b-b0c9-a68cde86a345)
- [Clio 2026 report release](https://www.clio.com/about/press/2026-legal-trends-report/)
- [Clio signup](https://www.clio.com/signup/)
- [TaxDome current registration](https://help.taxdome.com/article/72-firm-registration)
- [onboarding](https://taxdome.com/onboarding)

### Payments / tax / privacy / assurance / distribution

- [US DOJ guidance](https://www.justice.gov/eoir/page/file/1480746/dl)
- [Stripe Managed Payments eligibility](https://docs.stripe.com/payments/managed-payments/eligibility)
- [Stripe global](https://stripe.com/global)
- [Managed Payments](https://docs.stripe.com/payments/managed-payments)
- [Stripe currencies](https://docs.stripe.com/currencies)
- [Stripe Tax](https://docs.stripe.com/tax/how-tax-works)
- [US pricing](https://stripe.com/tax/pricing)
- [EU OSS](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop/register-oss_en)
- [cross-border VAT](https://europa.eu/youreurope/business/finance-and-tax/vat/cross-border-vat/)
- [Stripe method support](https://docs.stripe.com/payments/payment-methods/payment-method-support)
- [Stripe Connect](https://docs.stripe.com/connect)
- [W3C timezone draft note](https://www.w3.org/TR/timezone/)
- [internationalization guidance](https://www.w3.org/International/articles/intl/index.en.html)
- [EDPB transfers](https://www.edpb.europa.eu/sme/be-compliant/international-data-transfers_en)
- [EC SCC Q&A](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/new-standard-contractual-clauses-questions-and-answers-overview_en)
- [EDPB breach obligations](https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en)
- [AICPA SOC suite](https://www.aicpa-cima.com/resources/landing/system-and-organization-controls-soc-suite-of-services)
- [ISO/IEC 27001:2022](https://www.iso.org/standard/27001)
- [European Commission eSignature guidance](https://ec.europa.eu/digital-building-blocks/sites/spaces/DIGITAL/pages/467109069/What%2Bis%2BeSignature)
- [App Review Guidelines §3.1.3(c)](https://developer.apple.com/app-store/review/guidelines/)
- [Payments policy explanation](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en)

### Local source evidence / prior research

- [Domain language](../../CONTEXT.md)
- [Prisma schema and model inventory](../../apps/api/prisma/schema.prisma)
- [API module inventory](../../apps/api/src)
- [Prior Thai adjacent-segment research](2026-10-28-customer-segments-beyond-law-firms.md)
- [Prior CaseFox / Clio gap report](2026-10-11-casefox-clio-gap-report.md)
- [Prior legal AI benchmark](2026-09-23-legal-ai-practice-software-benchmark.md)
