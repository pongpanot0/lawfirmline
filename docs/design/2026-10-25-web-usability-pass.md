# Web usability pass (2026-10-25)

Goal: every logged-in web page is quicker to read and act on. **Operate mode**: scanability,
consistency and the next action outrank decoration. Keep the locked visual world in
[DESIGN.md](../../DESIGN.md) (Editorial Juris: paper cream, navy rail, Trirong headings, Noto Sans
Thai body). This is a usability pass, not a restyle.

Already done (do not redo): the shell. The account menu (language, theme, sign-out) lives on the
top-bar avatar, the sidebar holds navigation only, and sub-pages are indented.

## Never change

- Routes, permissions, API calls, data shapes, form validation, recovery or offline behaviour.
- Shared primitives in `apps/web/src/components/ui/*`, `components/layout/*` and
  `components/samnuan/PageHeader.tsx`. They are owned by the lead. If one needs a change, write it
  under "Needs from lead" in your report.
- Do not commit. Do not run `git stash`, `git checkout` or `git reset`; other agents edit the same
  checkout at the same time.

## Checklist for every page you own

1. **Title row.** Use `PageHeader` from `@/components/samnuan/PageHeader`: one `h1` noun title, an
   optional one-line description of the data (not instructions on how to use the screen), and
   actions on the right. Exactly **one** primary (filled) button: the page's most frequent job.
   Other actions are `variant="outline"` or `ghost`. Replace hand-rolled `<h1>` headers with it.
2. **Icons: lucide-react only.** Replace every emoji and text glyph used as an icon: 📎 💬 📝 📚 📄
   🤖 ⚖ 📌 🕐 🗺 🏛 ⚡ ⏳ ⏸ ✦ ✓ ✗ ✕ × ☐ ☑ ○ ▲ ▼ ⚠ ↗ ⌘. Also replace a leading `←` or trailing `→`
   on links and buttons ("← กลับ", "ดูทั้งหมด →") with `ArrowLeft`, `ChevronRight` or
   `ArrowUpRight`. Size `h-4 w-4` inline (`h-3.5 w-3.5` in dense rows), `aria-hidden`, gray unless
   it carries status. An icon-only button needs `aria-label`. Arrows inside sentences or data, such
   as "นัด 1 → นัด 2", may stay.
3. **States.** Each data block has a loading state (`PageLoading`/`Skeleton` at the real size), an
   empty state (`EmptyState` or `InlineEmptyState`: one sentence plus the action that fills it,
   keeping the block's frame), and an error state (`LoadFailed` with retry, inside the block). Add
   any that are missing. Do not invent data.
4. **Tables and lists.** Numbers and money are right-aligned with `tabular-nums`. Headers are
   sentence case 12–13px grey; no uppercase tracking; no zebra rows. A missing value is a grey `—`;
   a real zero prints as `0`. Status uses `Badge` with a pale tint and text, never colour alone.
   Below 640px a wide table either scrolls inside its own container (`overflow-x-auto`) or becomes
   two-line rows; the page never scrolls sideways.
5. **Forms.** The label sits above the field (`TextField`, `SelectField`, `DateField` from
   `@/components/ui/form-fields` where they fit). Required fields are marked. Errors appear next to
   the field. The submit button is at the end and says what it does ("บันทึกค่าใช้จ่าย", not
   "ตกลง"). Destructive actions come last, are outlined in the destructive colour, and confirm by
   naming the object.
6. **Copy (Thai first).** Use the words of the trade. Buttons are verbs. Remove instructional prose
   that explains the UI. Keep labels short. Do not translate existing English proper names.
7. **Hierarchy and density.** One clear largest thing per page: the block that answers the page's
   question. KPIs sit in one container split by dividers, label over value, no icon tiles. Remove
   duplicate actions that do the same thing twice on one screen. Tabs: one row; a stray label
   inside a tab row becomes a real tab or moves out.
8. **Touch and keyboard.** Targets are at least 44px on mobile. Every control is reachable by
   keyboard with a visible focus ring (the shared components already provide it; do not remove
   `focus-visible` classes).
9. **Mobile (390px).** Header actions wrap or fold into one menu, filters collapse to one row, and
   nothing overflows horizontally.

## Bans (impeccable and taste house rules)

No gradients, glows, glass or backdrop blur. No icon in a tinted circle or square on cards or KPIs.
No emoji. No uppercase letter-spaced labels. No new colours outside the tokens in `tokens.css` and
Tailwind theme aliases (`primary`, `muted`, `destructive`, `border`, `card`…). No shadows on resting
cards. No new dependencies.

## Verify before reporting

- `cd apps/web && ../../node_modules/.bin/tsc --noEmit -p .` passes.
- Re-read each changed file once for leftover glyphs:
  `grep -nP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" <files>` (or a Python equivalent) is empty.

## Report format

For each page: what changed (one line each), anything you could not do and why, and "Needs from
lead" (shared component changes). Keep it short.
