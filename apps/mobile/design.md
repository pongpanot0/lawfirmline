# Samnuan Mobile design

Hallmark · modern-minimal · Workbench adapted for a native legal operations app.
The runtime tokens are in `src/theme.ts`; all screens share this system. This file applies to Mobile, not the web landing page.

## Hierarchy and flow

- Today: greeting, decision queue, optional finance/assignment detail, task shortcuts, compact people, today's work and appointments.
- Team: workload comparison; tap the person's identity to open `person/[id]`. Category links remain available.
- Person: identity, queue counts, blockers, tasks, reviews, next seven days of appointments, cases, work types and approved leave. Tap accessible rows to open the existing task/case/event route.
- Cases, Calendar, Tasks: group search/filter controls above the list; keep the current filter visible and mark tappable details with a chevron.
- Forms: separate required details, scheduling, people and attachments into titled sections. Labels sit directly above inputs. Keep existing validation, permissions and submission behavior.
- Account: show profile first, fold password changes, and expose a dedicated deletion-request screen from Account, More and Settings. Clearly state that submitting a request does not delete the account immediately.
- Clients, expenses, leave, notifications, owner operations, reports, knowledge, court and authentication screens share the white canvas and restrained controls. Route-specific sectioning complements the shared system.

## Locked tokens

The canvas and navigation headers are white. Navy `ink` anchors text and primary actions. White cards use a soft gray border and shallow shadow; quiet gray surfaces group controls. Links use muted navy. Warm brown marks court dates/review queues, red marks overdue work, green marks completion. Keep these colors in small labels, icons or numbers, with text explaining every status. Do not fill headers, identity cards, dashboard blocks or statistic cards with saturated color.

`src/theme.ts` exports native-compatible color values; React Native does not consume CSS custom properties or OKLCH. These named tokens are the native equivalent of Hallmark's portable token block. Do not add one-off colors or fonts in screens.

Display: Anuphan 600/700; body: platform font with Thai support. Retain the app's text size preference and OS font scaling. Headings stay upright. Use the existing 4-point spacing scale; card radius 14, button radius 10. Shadows are subtle and functional.

All routes, including Court Day and authentication, use white backgrounds. No screen-local palette or dark-mode exception. Large text wraps; rows place auxiliary actions below content rather than squeezing titles beside buttons.

## Interaction

Primary actions are at least 44 points high; icon-only actions are 44 by 44. Calendar cells keep the seven-column grid with at least 44-point height. Press feedback uses one color or opacity change. Details with no access render as plain rows; do not simulate permission by opening a forbidden route. Loading, retry and empty states are explicit. Counts show `—` while unavailable. Queue size does not promise availability.

The existing five bottom tabs stay stable. Optional information folds rather than pushing today's work many screens down. No decorative illustrations, gradients, fake phone chrome, animated dashboards or fabricated metrics.

## Validation boundary

Component previews use React Native Web with mock data and native module adapters. They establish layout and tap behavior at 320/375/414/768 pixels and enlarged text; they do not establish Android device, production API or Google Play review success. Validate the signed native APK separately.
