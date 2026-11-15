# Samnuan mobile UI audit (2026-11-15)

**Question:** "ควร revamp mobile UI มั้ย" (should we revamp the mobile UI?)
**Answer:** No. Do targeted fixes. Details in the [verdict](#verdict) at the end.

**Status (same day, uncommitted):** #1, #2, #3 and #4 are fixed, and #9 had the same root cause. The custom-fields sheet rendered `{error && …}` with `error === ''`, which put a bare `""` inside a ScrollView. After screenshots are the `after-*.png` files in the shots folder. Not yet re-checked: large Dynamic Type for the new next-hearing card.

## Method

- **Build:** `apps/mobile` at `f50f1a7b` (main), Expo dev client on the iOS simulator `Samnuan-E2E-Small` (iOS 26.5, 375×667 pt, the iPhone SE class, which is the tightest screen we ship to).
- **Backend:** this worktree's API built and run on `:3015` against the local DB, signed in as `admin@lawfirm.com` (seed, Demo Law Firm). A first pass ran against another worktree's older API on `:3011`, which returned 404 for `/custom-fields`. That made the custom-fields card show "โหลดช่องข้อมูลไม่สำเร็จ". It was an environment artifact, not an app bug, so every custom-fields finding below comes from the `:3015` run.
- **Review:** the impeccable skill's native audit (`audit.native.md` + `ios.md`, five dimensions scored 0–4) and its polish checklist. Each screenshot was checked against the source in `apps/mobile`.
- **Dynamic Type:** also checked at the `accessibility-large` text size. Switching the size while the app was running clipped text on every screen. A cold launch at the same size removed the clipping, so the clipping is not reported; only defects that survived the cold launch are.
- **Not covered:** dark mode (the app locks to light on purpose: `app.json` `userInterfaceStyle: "light"`), iPad, Android, a real device, VoiceOver traversal.
- **Screenshots:** in [`2026-11-15-mobile-shots/`](2026-11-15-mobile-shots/). The Expo dev-menu gear in the top-right corner exists only in dev builds; ignore it.

## Audit health score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | 44 pt targets and labels are almost everywhere (151 `Pressable`, 202 roles, 169 labels). The custom-fields sheet traps its Save button under the keyboard. |
| 2 | Performance | 3 | Lists that grow (cases, tasks) are virtualized. Today and case detail are long `ScrollView`s with many queries, which is fine at current data sizes. |
| 3 | Appearance & theming | 3 | Tokens are used throughout: only 3 off-token colors app-wide, 2 of them in `CustomFieldsSection.tsx`. Light-only is a deliberate choice. |
| 4 | Platform conformance | 3 | Native tab bar, native stack headers with swipe-back, lucide icons only (57 imports, no second icon set). Custom-field booleans use a hand-drawn toggle. |
| 5 | Adaptivity | 3 | Text scales and wraps; tab and chip labels are capped by `CHROME_MAX_SCALE`. The greeting and wordmark break badly at large sizes. |
| | **Total** | **15/20** | **Good**: improve the weak spots, no overhaul needed |

**Platform conformance verdict: pass.** It reads as a native iOS app, not a ported website. Navigation, sheets, back gestures and the tab bar are platform-standard. The problems are in information order and one under-built component, not in the visual system.

## Top 10 issues, ranked by user impact

Severity: P0 blocks a task · P1 major difficulty · P2 annoyance with a workaround · P3 polish.

### 1. [P1] The keyboard covers the input and the Save button in the custom-fields sheet

- **Screen:** Case detail → ข้อมูลเพิ่มเติม → tap a field. Screenshots: `09-customfield-sheet-number.png` (sheet without keyboard), `10-customfield-sheet-keyboard.png` (with keyboard).
- **What happens:** For a NUMBER field the decimal pad covers the amount input, "บันทึก" and "ยกเลิก". The decimal pad has no return key, so you cannot submit from the keyboard either. You must know to dismiss the keyboard before you can save. This is a static overlap, not content scrolling under a bar.
- **Cause:** `src/components/CustomFieldsSection.tsx:21` renders a `Modal` with no `KeyboardAvoidingView`. The other sheets (`AddTimeSheet`, `Dropdown`, `CasePicker`, `PageFeedbackSheet`) already wrap theirs in one.
- **Fix:** Wrap the sheet like `AddTimeSheet.tsx` does (`KeyboardAvoidingView behavior="padding"` on iOS), or put the actions in a bar that sticks above the keyboard.

### 2. [P1] The next hearing is buried at the bottom of case detail

- **Screen:** Case detail. Screenshots: `06-case-top.png` and `07-case-mid.png`.
- **What happens:** The app is court-phone-first, yet "นัดถัดไป" sits about 1.5 screens down on an SE. Above it are a duplicate of the title and case number, plus five or more rows saying "ไม่มีข้อมูล". A lawyer at court has to scroll past empty fields to find today's hearing.
- **Fix:** Put the next hearing (date, time, court, room) first, directly under the title, and move the overview summary below it. Hide empty brief rows, or fold them into one line such as "ยังไม่ระบุ: ฝ่ายเรา, คู่กรณี, …".

### 3. [P1] Case detail shows the same facts twice, with three different ways of saying "empty"

- **Screen:** Case detail. Screenshots: `06-case-top.png`, `08-case-customfields.png`.
- **What happens:** `CaseBriefCard` lists ลูกความ, เราเป็น, คดี and others with "ไม่มีข้อมูล" in bold. The `InfoRow` card below repeats ลูกความ, เราเป็น, ศาล and others with "—". Between them, custom fields say "ยังไม่ได้กรอก", also in bold. In all three cases the empty marker is heavier than the field label, so the eye lands on what is missing instead of what is known.
- **Cause:** `CaseBriefCard.tsx:22` (`'ไม่มีข้อมูล'`), `app/case/[id].tsx:88` (`'—'`), `CustomFieldsSection.tsx` (`'ยังไม่ได้กรอก'`).
- **Fix:** Keep one card per fact and one muted empty marker (`—`, in the muted color at regular weight). The brief card should show only fields that have a value.

### 4. [P1] The custom-fields card is a one-off that bypasses the design system

- **Screen:** Case detail → ข้อมูลเพิ่มเติม. Screenshot: `08-case-customfields.png`.
- **What happens:**
  - The number shows as `2500000`, while the case card two cards down formats money as `1,000,000 บาท`.
  - The section label "ทั่วไป" repeats once per group and looks like body text, not a heading.
  - Booleans use a hand-drawn 36×20 toggle instead of the shared `SwitchRow`.
  - The "required" dot is hard-coded `'#b91c1c'` instead of `colors.warn`, and the scrim is `rgba(0,0,0,0.35)` instead of `colors.scrim`.
  - The whole component is one minified 22-line file, so it is hard to review or fix.
- **Fix:** Rebuild it from `FieldLabel`, `SwitchRow`, `Tag`, `FormSection`, `formatMoney` and theme tokens, matching the `InfoRow` row style. Keep the current behavior (staged save, required gate, sensitive badge). This is the single largest polish item, and it is where the owner's "should we revamp" feeling came from.

### 5. [P2] The secretary asks for "ยืนยัน" / "ยกเลิก" buttons that are not on screen

- **Screen:** เลขา (secretary). Screenshot: `15-secretary.png`.
- **What happens:** After you reopen the chat, earlier replies still say `กด "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก"`, but no buttons render. History reload (`app/secretary.tsx:84`) drops `proposal`/`proposalId`, and the confirm card renders only when both exist (line 195). When it does render, the button reads "ยืนยันบันทึก", not "ยืนยัน". A user may type "ยืนยัน" and assume the save went through.
- **Fix:** On reload, show expired proposals as a muted "รายการนี้หมดอายุ · ถามใหม่อีกครั้ง". Make the server copy match the button label ("ยืนยันบันทึก"). This also fits the rule that AI only acts when the user presses a button.

### 6. [P2] Today's decision tiles wrap their labels and show zeros at full weight

- **Screen:** Today → คิวตัดสินใจวันนี้. Screenshot: `04-today-queue.png`.
- **What happens:** All three labels wrap ("งานรอคุณ / ตรวจ", "ลารอ / อนุมัติ", "เบิกรอ / อนุมัติ"), which breaks the one-line label rule. Two tiles show a large `0` that takes as much space as the `1` that actually needs action.
- **Fix:** Use shorter one-line labels such as "รอตรวจ", "ลา", "เบิก", with "รออนุมัติ" as the section subtitle. Collapse zero tiles into a single muted line ("ไม่มีงานรอตรวจ · ไม่มีลารออนุมัติ"), or apply the existing `StatCard hideZero` pattern (`app/(tabs)/index.tsx:315-324`).

### 7. [P2] Today is a very long single scroll on a small phone

- **Screen:** Today. Screenshots: `02-today-top.png`, `03-today-mid.png`, `04-today-queue.png`.
- **What happens:** On an SE the first screen holds the nav title "วันนี้" and a large greeting (the same idea twice), the secretary card, the daily-brief button and shortcuts. The overdue item only starts at the fold. The decision queue, office money, work needing help, people and the task chips follow over about four screens.
- **Fix:** Drop the large greeting or merge it into the nav title, so overdue or today's hearings are the first thing below the header. Use the `Disclosure` fold that DESIGN.md already prescribes for optional sections (office money, people).

### 8. [P2] Calendar: the month grid fills the screen and today's agenda is below the fold

- **Screen:** ปฏิทิน (Calendar). Screenshots: `11-calendar.png`, `12-calendar-daylist.png`.
- **What happens:** The full month grid (7×44 pt rows) plus the Outlook toggle fill the first screen. "นัดวันนี้" and "+ เพิ่มนัด" are reachable only by scrolling. Event days show only a small dot, with no hint of court date vs other kinds.
- **Fix:** Default to a one-week strip that can expand to the month, and put the selected day's list directly under it. Use the brass color for court-date dots, as DESIGN.md already says (brass = court dates).

### 9. [P2] One render error during the run: "Text strings must be rendered within a `<Text>` component"

- **Screen:** It appeared after leaving case detail and the custom-fields sheet, and surfaced on Calendar. Screenshot: `11-calendar.png` (red toast at the bottom).
- **What happens:** In a release build this kind of error can blank a subtree or crash. It was seen once. I could not confirm its source because the toast was dismissed before its stack was read.
- **Candidates:** Patterns of the form `{someString && <Text…>}` that render a bare `""`, e.g. `app/(tabs)/calendar.tsx:267` `{item.location && …}` and `:262` `{chosenOutlook.webLink && …}`. The custom-fields `helpText` is NULL in this data, so it is ruled out.
- **Fix:** Reproduce with LogBox open and read the component stack. Replace string-valued `&&` with `!!value &&` or a ternary. A lint rule (`react-native/no-raw-text`, or a custom rule against non-boolean `&&` in JSX) would prevent the whole class of bug.

### 10. [P3] At large text sizes, names and the wordmark break mid-word

- **Screen:** Login and Today at `accessibility-large`, after a cold launch. Screenshots: `20-login-largetext.png`, `18-today-largetext.png`.
- **What happens:** The login wordmark breaks as "Samnu / an". The greeting renders "คุณSomchai" with no space (`app/(tabs)/index.tsx:208`), so a Latin name breaks as "Somc / hai", and the greeting alone fills the first screen.
- **Fix:** Use `adjustsFontSizeToFit` with `numberOfLines={1}` on the wordmark. Add a space or `​` between คุณ and a Latin first name. Cap the display heading with `maxFontSizeMultiplier` (body text keeps full scaling).

## Lesser notes (not in the top 10)

- **Cases list:** about 2.5 cases per SE screen, and the row shows no next-hearing date. For a court-first list, a "นัดถัดไป 1 ธ.ค." line would be more useful than the client line (`05-cases.png`).
- **Tasks:** the full-width "เพิ่มงาน" primary pushes the list down on every visit. A header "+" action, as on Cases ("+ รับเคส"), would match (`13-tasks.png`).
- **Team:** one person per screen on an SE, because each card carries three pill buttons. Comparing workload needs scrolling (`14-team.png`).
- **Calendar's Outlook detail modal** uses `rgba(0,0,0,0.5)` instead of `colors.scrim` (`calendar.tsx:262`).
- **Small type:** about 20 places use 11–12 pt for metadata (`fontSize: 11` in `team-week.tsx` and the Today shortcut labels, `9` on calendar mini-avatars). That is at or below the iOS 11 pt floor, though it still scales.
- **App lock (`00-lock.png`, `19-lock-largetext.png`):** clean, and it wraps well at large sizes. On this simulator the lock was still on from an earlier build, so every cold launch went through the device-passcode sheet. This is worth a manual check that PR #241's opt-in default also covers existing installs.

## What already works and should stay

- **The visual system.** Cream canvas, navy ink, hairline cards, the brass/red/green status colors with text labels, Anuphan headings. It is applied consistently, with only 3 off-token colors across about 40 screens. Do not throw this away.
- **Platform conformance.** Native tab bar with five stable sections, native stack with swipe-back, native sheets, the system password-save sheet working with login, lucide icons only.
- **Touch targets.** `TOUCH` (44 pt) is used across rows, chips, checkboxes (task checkbox: 24 pt visual, 44 pt hit area), calendar cells and header actions.
- **Text scaling.** Body text follows Dynamic Type and wraps instead of truncating. Tab, chip and tag labels are capped (`CHROME_MAX_SCALE`), so the chrome holds at large sizes (`21-today-largetext-scrolled.png`).
- **State handling.** Explicit loading, retry and empty states (`ErrorNote` with an inline "ลองใหม่", `EmptyNote` with a next step). Overdue work shows text ("เลยกำหนด 105 วัน ยังไม่ส่ง"), not just color.
- **More and Account.** Grouped lists with an icon, title and one-line hint per row; profile first; password change folded away (`16-more.png`, `17-account.png`).
- **Shared components.** `Button`, `FormField`, `FieldLabel`, `SwitchRow`, `Disclosure`, `States`. Every issue above can be fixed with what already exists.

## Verdict

**A full revamp is not warranted.** The design system, navigation and accessibility basics score 15/20 and read as a native, consistent app; a revamp would spend months re-solving what already works and would put court-day reliability at risk.

The pain the owner felt testing custom fields is real but local. It comes from one under-built component (#1, #4) and from information order on case detail and Today (#2, #3, #6, #7), not from the look of the app.

Recommended path: one targeted pass in this order:
1. Keyboard-safe custom-fields sheet + rebuild it from shared components (#1, #4).
2. Case detail: next hearing first, deduplicate, one empty style (#2, #3).
3. Today and Calendar density for small phones (#6, #7, #8).
4. Secretary expired-proposal copy, render-error lint rule, large-text fixes (#5, #9, #10).

Then re-run this audit on the same simulator to confirm the score moves from 15 to 17 or higher.
