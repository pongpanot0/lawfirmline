# Default courts and playbooks — research (2026-09-28)

Data: `packages/shared/src/index.ts` (DEFAULT_THAI_COURTS) and `packages/shared/src/default-playbooks.ts` (DEFAULT_PLAYBOOKS).

Removed from the old default list (not real courts): ศาลแพ่งกรุงเทพเหนือ, ศาลแพ่งกรุงเทพกลาง, ศาลอาญากรุงเทพเหนือ. Existing databases still have these rows — deactivate them in Settings if unwanted.

## Courts

## DEFAULT_THAI_COURTS: sources and notes

Total: 303 entries. 277 ศาลยุติธรรม (the exact official count), plus 9 ศาลสาขา, ศาลรัฐธรรมนูญ, and 16 ศาลปกครอง.

### Primary sources
- สำนักงานศาลยุติธรรม, สำนักแผนงานและงบประมาณ, "โครงสร้างศาลยุติธรรม". Data as of **1 เม.ย. 2568**. The PDF lists every court by ภาค:
  - https://oppb.coj.go.th/th/content/category/detail/id/54/cid/57/iid/126661
  - PDF: https://oppb.coj.go.th/th/file/get/file/20250401d41d8cd98f00b204e9800998ecf8427e161031.pdf
  - Infographic: https://oppb.coj.go.th/cms/s27/จำนวนศาล_1_เมษายน_2568.jpg
  - Counts check out: ฎีกา 1, ชั้นอุทธรณ์ 11, ชั้นต้น 265 (36 outside ภาค + 112 จังหวัด + 40 แขวง + 77 เยาวชนฯ), 9 สาขา.
- COJ court-name list, used to cross-check spelling: https://pubdata.coj.go.th/jurisdiction/cname.php. It is **stale**: it still lists the abolished ศาลจังหวัดมีนบุรี/ตลิ่งชัน/พระโขนง.
- ศาลแพ่งมีนบุรี history page: https://civilmbc.coj.go.th/th/content/category/detail/id/13024/iid/302870. On 1 ส.ค. 2562, ศาลจังหวัดมีนบุรี was abolished and replaced by ศาลแพ่ง/อาญามีนบุรี.
- พ.ร.ฎ. setting the location and opening date of ศาลแพ่ง/อาญา ตลิ่งชัน/พระโขนง/มีนบุรี, พ.ศ. 2562: https://dl.parliament.go.th/handle/20.500.13072/548271
- ศาลปกครอง, secondary: https://th.wikipedia.org/wiki/ศาลปกครอง_(ประเทศไทย). It lists 15 first-instance courts with their opening dates. admincourt.go.th is a JS single-page app and could not be scraped. The regional pages at https://www.admincourt.go.th/admincourt/admincourt-regions-grid should be checked by hand.

### Notes and decisions
- Dropped (abolished 2562): ศาลจังหวัดมีนบุรี, ศาลจังหวัดตลิ่งชัน, ศาลจังหวัดพระโขนง.
- New courts included: ศาลจังหวัดพระประแดง (opened 1 เม.ย. 2567), ศาลแขวงสุวรรณภูมิ and ศาลจังหวัดร้อยเอ็ด สาขาสุวรรณภูมิ (opened 1 เม.ย. 2568), and ศาลแพ่งมีนบุรีและศาลอาญามีนบุรีแผนกคดีเยาวชนและครอบครัว (opened 1 มิ.ย. 2567). COJ counts this last one among the 77 youth courts, so it is kept.
- The 9 ศาลสาขา use COJ's format "ศาลจังหวัดX สาขาY", without parentheses.
- The COJ PDF has a typo, "ศาลเยาวชนและครอบครัวจังหวัดสารคาม". It is written here as **มหาสารคาม**.
- pdftotext dropped Thai tone marks. Spellings were restored from the COJ cname list and standard province names.
- The 7 Bangkok ศาลแขวง are officially under ภาค 1. They are grouped under กรุงเทพฯ here.

### Uncertain / unverified (NOT in the list)
- **ศาลอาญาคดีค้ามนุษย์**: no such separate court exists in the COJ 2568 structure. Trafficking cases go to แผนกคดีค้ามนุษย์ in ศาลอาญา.
- **ศาลปกครองแพร่, บุรีรัมย์, สกลนคร, ลพบุรี, ชุมพร**: listed on Wikipedia only as "โครงการจัดตั้ง". No opening date could be confirmed. Add them once admincourt.go.th confirms they are open.
- **Old youth-court branches**: ศาลเยาวชนและครอบครัวจังหวัดตาก (สาขาแม่สอด) and ศาลเยาวชนและครอบครัวจังหวัดสุราษฎร์ธานี (สาขาเกาะสมุย) appear only in the stale cname list. They are absent from the 2568 structure, whose 9 official branches do not include them.
- **ศาลจังหวัดฝาง พิจารณาคดีเยาวชนและครอบครัว** (cname list only): this is a แผนก, so it was skipped as instructed.
- **ศาลทหาร** (e.g. ศาลทหารสูงสุด, ศาลทหารกลาง, ศาลทหารกรุงเทพ): not checked against sources in this session and left out.
- **ศาลปกครองกลาง/ภูมิภาค naming**: this comes from Wikipedia plus official site snippets, not from a scraped primary list.

## Playbooks

## Playbook sources and verification status

Researched 2026-09-28. Section numbers were checked against secondary sources that quote the statute, or taken from well-established law. Before shipping, have a Thai lawyer do a final read, especially on the items under **Unverified**.

### Deadlines used

| Deadline | Basis | Status |
|---|---|---|
| Request service of summons within 7 days of filing (otherwise treated as ทิ้งฟ้อง) | ป.วิ.พ. ม.173, 174(1) | Known law, not re-fetched |
| Answer within 15 days of receiving the summons | ป.วิ.พ. ม.177 | Verified |
| Service by posting or other methods takes effect after 15 days, so about 30 days in total | ป.วิ.พ. ม.79 | Verified (justicechannel.org, deka.in.th ฎ.883/2535) |
| Request default judgment within 15 days after the answer deadline passes | ป.วิ.พ. ม.197–198 | Known law, not re-fetched |
| Witness list at least 7 days before the witness hearing (civil) | ป.วิ.พ. ม.88, 90 | Known law |
| Witness list at least 15 days before the evidence-examination or witness-hearing date (criminal) | ป.วิ.อ. ม.229/1 | Verified (ohmslawtutor, srisunglaw) |
| Civil appeal within 1 month of the judgment being read | ป.วิ.พ. ม.229 | Known law |
| Civil Supreme Court appeal needs permission; petition plus appeal within 1 month | ป.วิ.พ. ม.247–249, 252 | Known law (2558 amendment) |
| Enforcement within 10 years of judgment | ป.วิ.พ. ม.274 | Known law (2560 Book 4 rewrite) |
| Criminal appeal and Supreme Court appeal each within 1 month | ป.วิ.อ. ม.198, 216 | Verified for 216 |
| Complaint for compoundable offence within 3 months | ป.อ. ม.96 | Known law |
| Arrested person brought to court within 48 hours | ป.วิ.อ. ม.87 | Known law |
| Estate administrator: start the inventory within 15 days, finish within 1 month, settle the estate within 1 year | ป.พ.พ. ม.1728, 1729, 1732 | Verified (legardy.com) |
| Inheritance claim: 1 year | ป.พ.พ. ม.1754 | Known law |
| Mortgage notice at least 60 days; guarantor notice within 60 days | ป.พ.พ. ม.728, 686 (2557 amendment) | Known law |
| Reserved company name is valid 30 days | DBD rule | Verified (DBD manuals and info.go.th) |
| Register a company within 3 months of the statutory meeting | ป.พ.พ. ม.1111 | Known law, not re-fetched |
| Trademark: opposition within 60 days of publication; registration fee within 60 days; renewal within 90 days before expiry | พ.ร.บ.เครื่องหมายการค้า (แก้ไข 2559) ม.35, 39, 54 | Verified (ipthailand.go.th and secondary sources) |

### Unverified or needs a lawyer's check

1. **Criminal Supreme Court appeal (ป.วิ.อ.)**: after the 2562 amendment (ฉบับที่ 34), it is unclear whether every criminal Supreme Court appeal needs permission, or only appeals caught by the restrictions in ม.218–221. The step says "ให้ทนายอาวุโสตรวจเงื่อนไข" so a senior lawyer checks this each time.
2. **Trademark ม.16–18 and ม.36 deadlines**: I used 60 days, which is my understanding after the 2559 amendment (the older figure was 90). I have not seen the amended text myself.
3. **Trademark ม.116 (provisional protection before filing suit)**: I could not confirm the deadline for filing suit after the order. The step says "ตรวจสอบ".
4. **Six-month renewal grace period for trademarks after expiry**: I believe this comes from the 2559 amendment, but I have not confirmed it.
5. **ป.พ.พ. ม.1097 (minimum of 2 promoters)** and **ม.1111**: these reflect the 2566 amendment (ฉบับที่ 23). I have not re-checked them against the Royal Gazette.
6. **Family court procedure**: I cited พ.ร.บ.ศาลเยาวชนและครอบครัวฯ 2553 "ม.142 เป็นต้นไป" in general terms only. The exact section for the reconciliation process has not been verified.
7. **ป.วิ.พ. ม.120/1 (written witness statements, filed at least 7 days ahead)**: known law, but the day count was not re-fetched.
8. **Stamp duty and VAT (ม.85/1, 1.8 million baht threshold)** and **Social Security Act ม.34 (30 days)**: known law, not re-fetched.

### Design notes

- Labour cases (พ.ร.บ.จัดตั้งศาลแรงงานฯ, where appeals are due within 15 days under ม.54) are not a case type in the app, so no playbook was written for them. Add one if a "คดีแรงงาน" type is created.
- The IP playbook reuses the litigation stages for the registration steps: HEARING means the opposition-watch period and AWAITING_JUDGMENT means the registration-fee step. Map these to IP-specific stages if you add them.
- Steps that depend on a court date (witness lists, witness preparation) cannot be timed from the date the case enters a stage. Their offsets are internal nudges only, and the instructions tell staff to count back from the court date.
- The civil playbook has 22 steps because it runs from intake through enforcement. Trim it to about 15 if the UI needs that.

### Source URLs

- https://justicechannel.org/en/listen-en/ep-15-subpoena-civil-warrant (ม.79 / ม.177 30-day practice)
- https://deka.in.th/view-14906.html (ฎ.883/2535, ม.79)
- https://ohmslawtutor.com/knowledge/lecture/lecture01/lecture1 (ป.วิ.อ. ม.229/1)
- https://srisunglaw.com/การยื่นบัญชีระบุพยาน-คด/ (witness lists in civil and criminal cases)
- https://ohmslawtutor.com/knowledge/lecture/lecture01/lc154 (ขออนุญาตฎีกา อาญา, ฎ.781/2567)
- https://www.advancedlaw9.com/2020/09/08/ (ป.วิ.อ. update 34-2562)
- https://www.drthawip.com/civilprocedurecode/043 (ป.วิ.พ. ฎีกา ม.247–252)
- https://legardy.com/thai-law/civil-and-commercial-section1599-1755/civil-and-commercial-section1729 (ม.1728–1732)
- https://www.ipthailand.go.th/images/633/law_a2534-2-edit.pdf (พ.ร.บ.เครื่องหมายการค้า consolidated)
- https://www.etda.or.th/... (พ.ร.บ.เครื่องหมายการค้า ฉบับที่ 3 พ.ศ. 2559, Royal Gazette vol. 133 part 38 ก)
- https://www.dbd.go.th/storage/manual/0097faba-992d-4e07-8f37-d029a4d6c133.pdf (DBD company registration manual)
- https://www.dbd.go.th/download/downloads/03_boj/intro_step_bj_establish.pdf
- https://edbr.dbd.go.th/ (DBD Biz Regist)
- https://info.go.th/procedure/94e56d26-41d0-42e6-91ff-1ba3bdc15b88/view (name reservation)
