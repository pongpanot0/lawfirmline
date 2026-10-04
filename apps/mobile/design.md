# Samnuan Mobile design

Hallmark · modern-minimal · Workbench adapted for a native legal operations app.
The runtime tokens are in `src/theme.ts`; all screens share this system. This file applies to Mobile, not the web landing page.

## Hierarchy and flow

- Today: greeting, decision queue, optional finance/assignment detail, task shortcuts, compact people, today's work and appointments.
- Team: workload comparison; tap the person's identity to open `person/[id]`. Category links remain available.
- Person: identity, queue counts, blockers, tasks, reviews, next seven days of appointments, cases, work types and approved leave. Tap accessible rows to open the existing task/case/event route.
- Cases, Calendar, Tasks: retain their established flows and share the header, navigation, card, button, type and status tokens.
- Forms, account, clients, expenses, leave, notifications, owner operations and court flows retain their existing routes and behavior.

## Locked tokens

Navy `ink` anchors navigation and primary actions; tinted blue paper separates white cards from the canvas. Teal indicates links and information. Warm gold marks court dates/review queues, red marks overdue work, green marks completion. Status labels accompany color.

`src/theme.ts` exports native-compatible color values; React Native does not consume CSS custom properties or OKLCH. These named tokens are the native equivalent of Hallmark's portable token block. Do not add one-off colors or fonts in screens.

Display: Anuphan 600/700; body: platform font with Thai support. Retain the app's text size preference and OS font scaling. Headings stay upright. Use the existing 4-point spacing scale; card radius 14, button radius 10. Shadows are subtle and functional.

## Interaction

Tap targets are at least 44 points. Press feedback uses one color or opacity change. Details with no access render as plain rows; do not simulate permission by opening a forbidden route. Loading, retry and empty states are explicit. Counts show `—` while unavailable. Queue size does not promise availability.

The existing five bottom tabs stay stable. Optional information folds rather than pushing today's work many screens down. No decorative illustrations, gradients, fake phone chrome, animated dashboards or fabricated metrics.

## Validation boundary

Component previews use React Native Web with mock data and native module adapters. They establish layout and tap behavior at 320/375/414/768 pixels and enlarged text; they do not establish Android device, production API or Google Play review success. Validate the signed native APK separately.
