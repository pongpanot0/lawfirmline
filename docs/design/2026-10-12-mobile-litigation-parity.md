# Mobile litigation parity: design (2026-10-12)

Requirements: `docs/superpowers/specs/2026-10-12-mobile-litigation-parity.md`. Expo app only. Designer: Iris.

**In scope:** the 8 items, on the screens that already exist. **Out of scope:** new tabs, new UI dependencies, haptics (`expo-haptics` is not installed, so we use no haptics), a toast system (the app uses `Alert.alert` plus inline status text, and we keep that).

## Design principles applied

1. **Deadline first, everything else after.** The things that can cost a case (pending confirmations, limitation date) sit above the tabs. Everything else stays where it is today.
2. **One structured tap beats typing.** Court events are 4 big choices, not a form with a type dropdown.
3. **Say what the system did.** Every legal mutation ends with a result line that names the stage and the dates in Buddhist-calendar Thai.
4. **No optimism on law.** Deadline rows only change after the server answers. The row shows a spinner and stays put until then.
5. **Cache shows, network acts.** Sections render from the React Query cache. When offline, action buttons are disabled and labelled `ต้องต่อเน็ตเพื่อบันทึก`. They never fail silently.
6. **Thumb zone.** Primary buttons sit at the bottom of each card or sheet. Destructive or legal actions always go through `Alert.alert` with the real date in the text.
7. **Few new parts.** Three new shared components. All other UI reuses `Card`, `Tag`, `Button`, `Disclosure`, `SectionLabel`, `ErrorNote`, `EmptyNote`, `Loading`, `FormSection`, `FormField`, `Dropdown`, and the `ReassignSheet` modal pattern.

## Color tokens (hex, from `apps/mobile/src/theme.ts`, no new tokens)

| Use | Token | Hex |
|---|---|---|
| Page bg | `colors.bg` | #F7F4ED |
| Card | `colors.surface` | #FFFDFA |
| Text / primary button | `colors.ink` | #142E43 |
| Secondary text | `colors.muted` | #52616B |
| Divider | `colors.line` | #DFE0DC |
| Urgent (≤7 days, overdue) fg / bg | `colors.warn` / `warnSoft` | #A83232 / #FAEDEB |
| Soon (8–30 days) fg / bg | `colors.accentInk` / `accentSoft` | #73520C / #F7F3EB |
| Calm (>30 days) fg / bg | `colors.info` / `infoSoft` | #36566B / #E8EDF0 |
| Done / confirmed fg / bg | `colors.good` / `goodSoft` | #227050 / #EAF3ED |
| Current court level rail | `colors.accent` | #8B6D32 |

**Urgency thresholds.** Days are counted on the Bangkok calendar from today to the due date, and the deadline time is 16:30.

| Days left | Tone | Copy |
|---|---|---|
| Past 16:30 on the due date | `Tag tone="due"` | `เลยกำหนด N วัน` |
| Today, before 16:30 | `Tag tone="due"` | `ครบกำหนดวันนี้ 16:30 น.` |
| 1–7 | `Tag tone="due"` | `เหลือ N วัน` |
| 8–30 | `Tag tone="court"` | `เหลือ N วัน` |
| >30 | `Tag tone="info"` | `เหลือ N วัน` |

Put this logic in one pure function, `deadlineUrgency(isoDate, now)`, in `apps/mobile/src/deadline.ts`, with a static check script.

## New shared components (3)

| Name | Props | Used by |
|---|---|---|
| `ThaiDateField` (`src/components/ThaiDateField.tsx`) | `{ label: string; value: string \| null; onChange(iso: string \| null): void; clearable?: boolean; clearConfirm?: { title: string; body: string }; hint?: string }` | 5, 1 (date of event), 8 (interest dates) |
| `SectionCard` (`src/components/SectionCard.tsx`) | `{ title: string; count?: number; tone?: 'due' \| 'court' \| 'info'; collapsible?: boolean; defaultOpen?: boolean; summary?: string; children }` | 2, 4, 6, case screen sections, home |
| `ActionSheet` (`src/components/ActionSheet.tsx`) | `{ visible: boolean; title: string; detail?: string; onClose(): void; children }`. This is the bottom `Modal` lifted out of `ReassignSheet`. | 1, 6 (return reason), 7 (mention picker reuses its list styling) |

**`ThaiDateField` rules:**
- It shows three inputs: วัน, เดือน (a `Dropdown` with the Thai months), and ปี พ.ศ. (4 digits). A calendar icon button opens the existing `DatePicker` modal.
- It emits `onChange` only when all three parts form a real date. Example: 31 เม.ย. is rejected with `วันที่นี้ไม่มีในปฏิทิน`.
- A partial entry shows `กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด`. The parent form blocks save while the field reports `invalid`.
- The year field accepts พ.ศ. 2400–2700. If someone types a ค.ศ. year, show `ใส่ปี พ.ศ. (เช่น 2569)`.
- Under a valid value, show a read-back line, e.g. `พฤหัสบดี 13 พ.ย. 2569`.

**`SectionCard`** is `Card` + title row + count `Tag` + optional `Disclosure`-style chevron. The whole header is the 44pt tap target.

---

## Case screen: section order (must stay scannable)

Above the tabs (always visible, from cache):
```
┌──────────────────────────────┐
│ คดีแพ่ง ผบ.123/2569          │ caseTitle
│ ┌ รอยืนยันวันครบกำหนด  [2] ┐ │ SectionCard tone=due, open   (item 2, only if count>0)
│ │ ...                        │ │
│ └────────────────────────────┘ │
│ ┌ งานรอคุณตรวจ · เอกสาร [1] ┐ │ SectionCard tone=court, open (item 6, only if mine>0)
│ └────────────────────────────┘ │
│ อายุความ 13 พ.ย. 2569  [เหลือ 32 วัน] │ one line (item 4) → tap scrolls to detail
│ ▸ จัดการคดีและผู้รับผิดชอบ     │ existing Disclosure
│ [ภาพรวม|นัดหมาย|งาน|เอกสาร]    │ existing segment
└──────────────────────────────┘
```
Inside the `ภาพรวม` tab, after the existing status/people `Card`:
1. **ศาลและเลขคดี** (item 4): `SectionCard`, open. Up to 3 rows.
2. **บันทึกเหตุการณ์ในศาล** (item 1): one `Button`, which opens an `ActionSheet`.
3. **คำนวณค่าขึ้นศาล / ดอกเบี้ย** (item 8): `SectionCard collapsible defaultOpen={false}`.
4. Existing content (insurance etc.) follows unchanged.

Empty sections render nothing, except item 4, which shows "ยังไม่ระบุ" lines so the gap is visible. The result is at most two urgent cards above the tabs, and only when there is something to act on.

---

## 1. Record court events

**Entry points**
- Case → ภาพรวม → `บันทึกเหตุการณ์ในศาล` → choose the event → `บันทึก`. That is **3 taps**.
- Court-day → under `ผลนัด`, the chip row `ศาลอ่านคำพิพากษาวันนี้` opens the same sheet with the type preset to judgment and the court level preset. That is **2 taps** (chip, `บันทึก`).

```
ActionSheet "บันทึกเหตุการณ์ในศาล"
┌──────────────────────────────┐
│ ชั้นศาล  [ชั้นต้น|อุทธรณ์|ฎีกา] │ FilterTabs, default = current level
│ ┌──────────┐┌──────────┐     │ 2×2 big tiles (Pressable, min 64pt)
│ │ ยื่นฟ้อง  ││ ส่งหมาย   │     │
│ └──────────┘└──────────┘     │
│ ┌──────────┐┌──────────┐     │
│ │อ่านคำพิพากษา││ได้รับสำเนาอุทธรณ์│
│ └──────────┘└──────────┘     │
│ วันที่เกิดเหตุการณ์ [ThaiDateField] default วันนี้ │
│ (type-specific field, e.g. ผลคำพิพากษา Dropdown — only if API needs it) │
│ [ บันทึก · ไม่ย้อนกลับเอง ]   │ Button, bottom
└──────────────────────────────┘
```
**Components:** `ActionSheet`, `FilterTabs`, `ThaiDateField`, `Dropdown`, `Button`. For the selected tile, use the `colors.ink` border and `accentSoft` fill.

**Copy and confirmation**
- Confirmation, via `Alert.alert`:
  - Title: `ยืนยันบันทึก{เหตุการณ์}`
  - Body: `ชั้น{ระดับ} · วันที่ {13 ต.ค. 2569}\nระบบจะปรับขั้นตอนคดีและเสนอวันครบกำหนดให้ยืนยัน`
  - Buttons: `กลับไปแก้`, `บันทึก`.
- Success: an inline green `Card` at the top of the case screen, built from the API response. Examples:
  - `บันทึกแล้ว · ขั้นตอนคดีเป็น "รออุทธรณ์" · ระบบเสนอวันยื่นอุทธรณ์ 13 พ.ย. 2569 16:30 น. รอยืนยัน`
  - When there are no suggestions: `บันทึกแล้ว · ไม่มีวันครบกำหนดที่ต้องยืนยัน`
- Error: `Alert.alert('บันทึกไม่สำเร็จ', <API message in Thai> ?? 'ลองใหม่อีกครั้ง')`. Keep the sheet open with its input intact.
- Offline: the button is disabled with the label `ต้องต่อเน็ตเพื่อบันทึก`, and the sheet stays open.
- Sending: `Button busy`.
- Permission-hidden: the button and chip are not rendered unless the user passes the proceedings guard. Read the API guard; mirror it in `canRecordProceedings(user, case)`.

**After success:** invalidate `case`, `date-suggestions`, `my-day`, `todos`, and `notifications`. Undo: none, because this is a legal record. The confirmation dialog takes undo's place.

## 2. Confirm / dismiss deadline suggestions

**Entry points**
- A push notification or the notice opens `/case/[id]`, and the card is open at the top. That is 1 tap per item.
- Home: the pending row (see Home).

```
SectionCard "รอยืนยันวันครบกำหนด" [2] tone=due
┌──────────────────────────────┐
│ ยื่นอุทธรณ์          [เหลือ 32 วัน] │ rule label + urgency Tag
│ 13 พ.ย. 2569 · 16:30 น.        │ bold Anuphan
│ ป.วิ.พ. ม.229                   │ legal basis, muted
│ ⚠ ปฏิทินวันหยุดปีนี้ยังไม่ครบ ตรวจวันอีกครั้ง │ warnSoft strip, only if flagged
│ [✕ ไม่ใช้]          [✓ ยืนยันวันนี้] │ ghost / primary, both 44pt, ✓ on the right (thumb)
└──────────────────────────────┘
```
**Copy and confirmation**
- ✓ is a single tap with no dialog. The date is already on screen, and confirming is the expected path. On success the row turns green for 1.5 s with `ยืนยันแล้ว · เพิ่มในปฏิทินคดี 13 พ.ย. 2569 16:30 น.`, then leaves the list.
- ✕ requires confirmation:
  - Title: `ไม่ใช้วันที่ระบบเสนอ?`
  - Body: `ยื่นอุทธรณ์ 13 พ.ย. 2569 จะไม่ถูกเพิ่มเป็นวันครบกำหนด ถ้าต้องใช้ภายหลังต้องเพิ่มเอง`
  - Buttons: `ยกเลิก`, `ไม่ใช้` (destructive).
  - Success: `ไม่ใช้แล้ว · ไม่ได้เพิ่มวันครบกำหนด`.
- No undo, because the API has no un-dismiss (see Open questions).
- Loading: show the cached list, plus `Loading` only when there is no cache.
- Empty: the card is hidden.
- Error: `ErrorNote message="โหลดวันรอยืนยันไม่ได้" onRetry`.
- Offline: both buttons are disabled, with the inline line `ออฟไลน์ · ต้องต่อเน็ตเพื่อยืนยันวันครบกำหนด`.
- Sending: only that row's buttons go busy. Do not optimistically remove the row.
- Permission-hidden: users without the confirm permission see the list read-only, with the line `รอผู้รับผิดชอบคดียืนยัน`.

## 3. งานรอคุณตรวจ for every reviewer

Home, `(tabs)/index.tsx` ~line 220. Remove the `isOwner ?` gate around the `{ view: 'review', label: 'งานรอคุณตรวจ' }` decision-queue item, and fetch `reviews` for everyone. The API `view=review` already filters to the right people.
- Non-owners already see the `รอฉันตรวจ` filter row under `งานที่ต้องจัดการ` (line 274). Keep that one, and don't add a duplicate. The home rule below says where it sits.
- Tap path: home row → task, then `TaskWorkView` approve. That is **2 taps**.
- Empty: the row is hidden (count 0).
- Error: the existing `ErrorNote message="โหลดงานรอตรวจไม่ได้"`.

## Home placement (items 2 + 3)

At the top of home, above `คิวตัดสินใจวันนี้`, add one `SectionCard title="ต้องจัดการก่อน"`, shown only when either count is > 0:
```
┌ ต้องจัดการก่อน ───────────────┐
│ วันครบกำหนดรอยืนยัน      [3] › │ ActionRow → if all in 1 case: /case/[id]; else /notifications?filter=deadline
│ งานรอคุณตรวจ             [2] › │ ActionRow → tasks view=review
│ เอกสารรอคุณตรวจ          [1] › │ (item 6)
└──────────────────────────────┘
```
`Tag tone="due"` marks the deadline count. Other rows use `tone="court"`. The pending-deadline count needs one field from the API (see Open questions).

## 4. Limitation date + court numbers per level

```
SectionCard "ศาลและเลขคดี"
┌──────────────────────────────┐
│ อายุความ  13 พ.ย. 2569  [เหลือ 32 วัน] │
│──────────────────────────────│
│▌ศาลชั้นต้น · กำลังพิจารณา      │ accent left rail (3pt) + Tag "ชั้นปัจจุบัน"
│  ศาลแพ่งกรุงเทพใต้              │
│  ดำ พ.123/2569 · แดง —          │ numbers selectable (long-press copy)
│ ศาลอุทธรณ์                      │ muted, "ยังไม่ถึงชั้นนี้"
│ ศาลฎีกา                         │ muted
└──────────────────────────────┘
```
- Missing values: `ยังไม่ระบุอายุความ` (with an `แก้ไข` link to item 5 for editors), `เลขคดีดำ —`.
- Offline: render from cache, plus the existing stale line style `ข้อมูลล่าสุดเมื่อ {เวลา}`.
- Levels after the current one are muted. Earlier levels show normally.

## 5. Limitation date on create / edit

In `case/new.tsx`, inside the existing `FormSection title="ข้อมูลคดี"`, add `ThaiDateField label="วันครบอายุความ" clearable hint="ว่างได้ ถ้ายังไม่ทราบ"`.
- Saving with an invalid field: `Alert.alert('ตรวจวันครบอายุความ', 'กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด')`, and focus moves to the field.
- Clearing an existing value asks for confirmation:
  - Title: `ลบวันครบอายุความ?`
  - Body: `คดีนี้จะไม่มีการเตือนอายุความอีก`
  - Buttons: `ยกเลิก`, `ลบวันที่` (destructive).
- After the clear is confirmed, the field shows `จะลบเมื่อกดบันทึก` until the form is saved. Undo before saving means tapping `คืนค่าเดิม`.
- Success: the existing save message, plus the case header line updating.
- Draft safety: the typed parts stay in form state. Do not reset them on a network error.

## 6. Approve / return document review rounds

**Entry points**
- The case top card `เอกสารรอคุณตรวจ`.
- The notice in `notifications.tsx`, which opens `/case/[id]?section=documents&round={id}` with the round expanded.

```
SectionCard "เอกสารรอคุณตรวจ" [1]
│ สัญญาประนีประนอม · ฉบับที่ 3      │
│ ส่งโดย สมชาย · 11 ต.ค. 2569       │
│ [เปิดเอกสาร]                      │ ghost, reuses court-day open-doc pattern
│ [ส่งกลับแก้]        [อนุมัติ]       │ approve on the right
```
- Approve is **2 taps**, with a confirmation:
  - Title: `อนุมัติฉบับที่ 3?`
  - Body: `ผู้ส่งจะได้รับแจ้งว่าอนุมัติแล้ว`
  - Success: `อนุมัติแล้ว · แจ้งสมชายแล้ว`.
- Return: opens an `ActionSheet title="ส่งกลับแก้"` with a `FormField multiline label="เหตุผล (จำเป็น)"`. The bottom `Button title="ส่งกลับ"` stays disabled while the field is empty, and the keyboard stays open (`KeyboardAvoidingView`, the same as `ReassignSheet`). Success: `ส่งกลับแล้ว · แจ้งสมชายพร้อมเหตุผล`.
- Opening the document needs the network. Offline shows `ต้องต่อเน็ตเพื่อเปิดเอกสาร`.
- Permission-hidden: only the round's reviewers see the buttons. Others see `Tag tone="info"` reading `รอ {ชื่อ} ตรวจ`.

## 7. @mention in task comments

In `TaskWorkView`'s comment `TextInput`, typing `@` opens an inline list **above the keyboard**, not as a modal. The list shows up to 5 people, filtered by the text after `@`, and comes from the task's team or firm members.
```
│ ┌ สมชาย ใจดี · ทนายความ     ┐ │ rows 44pt
│ │ สมหญิง ...                 │ │
│ └ แจ้งเตือนเฉพาะคนที่เปิดงานนี้ได้ ┘ │ muted footer hint, always shown
│ [ความเห็น… @สม           ] [ส่ง] │
```
- Tapping a row inserts `@ชื่อ ` and closes the list.
- No match: `ไม่พบชื่อนี้`.
- Members failing to load: the list is hidden, and plain text still sends.
- Success: the existing comment-post behaviour. If the API reports dropped mentions, add `บางคนไม่ได้รับแจ้งเพราะเปิดงานนี้ไม่ได้`.

## 8. Court-fee and interest calculator

This is a `SectionCard collapsible` on ภาพรวม, closed by default, with the summary `ประมาณการ · ทุนทรัพย์ {x} ฿`.
```
│ ทุนทรัพย์ (บาท) [ 1,250,000 ]    │ FormField numeric, prefilled from case claimed amount
│ ค่าขึ้นศาลโดยประมาณ  12,500 ฿    │ courtFee()
│──────────────────────────────│
│ ดอกเบี้ยต่อปี (%) [ 5 ]          │ DEFAULT_INTEREST_RATE
│ ตั้งแต่ [ThaiDateField] ถึง [ThaiDateField วันนี้] │
│ 412 วัน · ดอกเบี้ย 70,603 ฿       │ interestDays + simpleInterest
│ ⓘ ประมาณการเท่านั้น ไม่รวมค่าส่งหมาย ค่าทนาย ค่าธรรมเนียมอื่น และดอกเบี้ยที่ศาลสั่งต่างจากนี้ │
```
- It works fully offline, because it is pure functions from `@lawfirm/shared`. There are no actions and nothing is saved.
- An empty amount shows `กรอกทุนทรัพย์เพื่อคำนวณ`.
- Confirm the exact "not covered" list against the web `LitigationCalculatorsCard` copy, and do not invent new items.

---

## Open questions
1. Is there a per-user pending date-suggestion count for home, or should mobile aggregate it from notifications? If neither exists, a tiny API field is needed.
2. Can a dismissed suggestion be restored? If yes, add `เลิกทำ` for 5 s after a dismiss.
3. Do the proceeding endpoints return the stage plus the created suggestions in the response? The success copy depends on it.
4. Does the mention API report dropped mentions?

## Handoff
- New: `apps/mobile/src/components/{ThaiDateField,SectionCard,ActionSheet}.tsx`, `apps/mobile/src/deadline.ts` with a static check in `apps/mobile/scripts/`.
- Extend: `app/case/[id].tsx`, `app/court-day/[eventId].tsx`, `app/(tabs)/index.tsx` (lines ~216–284), `app/case/new.tsx`, `src/components/TaskWorkView.tsx`, `app/notifications.tsx` (deep links).
- Refactor: `ReassignSheet` to use `ActionSheet`. Optional; do it only if the diff stays small.

Iris
