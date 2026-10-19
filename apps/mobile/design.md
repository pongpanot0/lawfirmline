# Samnuan Mobile design

Hallmark · modern-minimal · Workbench adapted for a native legal operations app.
The root [design.md](../../design.md) locks the shared Editorial Juris identity from Stitch. Native tokens are in `src/theme.ts`; all 41 screens share this system.

## Hierarchy and flow

- Today: greeting, decision queue, optional finance/assignment detail, task shortcuts, compact people, today's work and appointments.
- Team: workload comparison; tap the person's identity to open `person/[id]`. Category links remain available.
- Person: identity, queue counts, blockers, tasks, reviews, next seven days of appointments, cases, work types and approved leave. Tap accessible rows to open the existing task/case/event route.
- Cases, Calendar, Tasks: group search/filter controls above the list; keep the current filter visible and mark tappable details with a chevron.
- Forms: separate required details, scheduling, people and attachments into titled sections. Labels sit directly above inputs. Keep existing validation, permissions and submission behavior.
- Account: show profile first, fold password changes, and expose a dedicated deletion-request screen from Account, More and Settings. Clearly state that submitting a request does not delete the account immediately.
- Clients, expenses, leave, notifications, owner operations, reports, knowledge, court and authentication screens share the cream canvas and restrained controls. Route-specific sectioning complements the shared system.

## Locked tokens

The canvas is paper cream (#F7F4ED), with warm-white surfaces (#FFFDFA) and navy ink (#142E43). Cards use a hairline division and no decorative shadow. Links use muted navy. Brass marks court dates/review queues, red marks overdue work, green marks completion, with text explaining every status.

`src/theme.ts` exports native-compatible color values; React Native does not consume CSS custom properties or OKLCH. These named tokens are the native equivalent of Hallmark's portable token block. Do not add one-off colors or fonts in screens.

Display: Anuphan 600/700; body: platform font with Thai support. Retain text size preference and OS scaling. Upright headings, existing 4-point spacing scale, card/button radius 8, status radius 4. Body and detail text wrap.

All routes, including Court Day and authentication, use cream backgrounds. Large text wraps; rows place auxiliary actions below content rather than squeezing titles beside buttons.

## Interaction

Primary actions are at least 44 points high; icon-only actions are 44 by 44. Calendar cells keep the seven-column grid with at least 44-point height. Press feedback uses one color or opacity change. Details with no access render as plain rows; do not simulate permission by opening a forbidden route. Loading, retry and empty states are explicit. Counts show `—` while unavailable. Queue size does not promise availability.

The existing five bottom tabs stay stable. Optional information folds rather than pushing today's work many screens down. No decorative illustrations, gradients, fake phone chrome, animated dashboards or fabricated metrics.

## Shared components

Use these instead of one-off controls; they carry the label, state and 44-point rules above.

- `Button` `variant`: `primary` (one per screen), `secondary` (bordered; the old `ghost` still maps here), `link` (navigation and optional paths, always inline, muted navy), `danger` (reject/delete, warning outline). `inline` sizes a button to its label.
- Fields: `FormField` takes a `hint` plus keyboard props (`keyboardType`, `secureTextEntry`, `maxLength`, `autoCapitalize`, `returnKeyType`, `onSubmitEditing`). `FieldLabel` is the 14/600 label above any input; `FormSection` titles are Anuphan 17, so fields never read as headings. `required` adds ` *` and announces "จำเป็นต้องกรอก".
- Pickers keep a visible label after a value is picked: `Dropdown fieldLabel=…` (opt-in; `label` alone stays the placeholder and modal title), `DatePicker label=…`, `CasePicker label=…`, `ClientPicker label=…`. All take `required` and `error`. `Dropdown inline` renders 4 or fewer options as chips. `DatePicker` takes `minDate`/`maxDate` and `onClear`.
- Validation: `triedSave` + `FieldError` under the field + `MissingSummary` above the primary. `Alert` is for irreversible confirmations only.
- `SwitchRow` and `CheckRow`: the whole row toggles (48 points); checkboxes are drawn icons, never ☐/☑ glyphs.
- `Disclosure variant="plain"` drops the card frame so cards and fields inside it are not nested cards; the summary is read as the hint.
- States: `Loading label=…` (visible and announced), `ErrorNote` (role alert, retry beside the message), `EmptyNote action={{ title, onPress }}` for the next step. Never show "ไม่มี…" when a load failed.
- `StatCard` defaults to ink, takes `hideZero` and `onPress`; a tile must not repeat a count shown in the section header below it. `PageIntro detailOnly` keeps one explanatory line under a native header instead of a second title.
- `Attachments`: one `แนบไฟล์หรือรูป` action (native action sheet on iOS, inline choice on Android); an oversize file is skipped on its own.
- Vocabulary: `TASK_STATUS_LABEL`/`taskStatusTone` and `EVENT_KIND_LABEL` in `ui.tsx`. Tokens: `colors.scrim` for modal backdrops, `CHROME_MAX_SCALE` as `maxFontSizeMultiplier` on tags, chips and tab labels.

## Validation boundary

Component previews use React Native Web with mock data and native module adapters. They establish layout and tap behavior at 320/375/414/768 pixels and enlarged text; they do not establish Android device, production API or Google Play review success. Validate the signed native APK separately.
