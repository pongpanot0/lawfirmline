# LexFlow Mobile App — Implementation Plan

**Date:** 2026-09-14
**Status:** Draft — approved direction from CEO, stack pending final confirmation
**UI mockups:** https://claude.ai/code/artifact/4db6a0fe-5fa0-42b1-8bb3-40e46e6db078

## Goal

Lawyers work a full day from the phone **instead of a computer at court**. The app is a
first-class client of the existing NestJS API (`apps/api`), reusing `packages/shared`
types. Web (`apps/web`) stays the surface for admin/setup work.

## Product principles (from CEO, 2026-09-14)

1. **Court-phone-first** — Court Day mode with offline reading is the core scenario.
2. **Speed-first UI** — main actions in 1–2 taps; cache-first render then refresh;
   optimistic updates (task ticks, notes never wait for the server); one-hand use;
   search reachable from every screen; no stacked modals.
3. **Team Workload dashboard is a Phase 1 must-have** — one screen showing who holds how
   many tasks/cases/hearings, who is overloaded, with reassignment from that screen.

## Stack (proposed)

- **React Native + Expo** (managed workflow), TypeScript.
  Rationale: reuse `packages/shared` DTO types and the team's TS conventions; EAS for
  builds/OTA updates. Alternative considered: Flutter (rejected: no type sharing).
- New workspace: `apps/mobile` in the pnpm monorepo.
- State/data: TanStack Query with persisted cache (MMKV) for cache-first + offline;
  mutations queued offline and replayed (court basements have no signal).
- Navigation: Expo Router. Bottom tabs: **วันนี้ / คดี / ปฏิทิน / ทีม / อื่น ๆ**.
- Auth: existing JWT login + refresh; secure storage (Keychain/Keystore); Face ID/PIN
  app lock; deep links for invite/handoff (`(auth)/invite`, `(auth)/handoff` parity).
- Push: Expo Notifications → FCM/APNs.
- i18n: TH/EN, Buddhist-era dates, court holidays from `holidays` module.

## Backend work (apps/api)

| # | Change | Module | Notes |
|---|--------|--------|-------|
| B1 | Device token registration (`POST/DELETE /notifications/devices`) | `notifications` | store token per user+device; prune on 410 |
| B2 | Push dispatch on existing notification events | `notifications` | hearing changes, deadline reminders, portal document uploads, task assignment |
| B3 | Workload summary endpoint (`GET /dashboard/workload`) | `dashboard` | per-lawyer: open tasks, overdue, cases owned, hearings this week; firm-scoped authz |
| B4 | Court-day bundle endpoint (`GET /agenda/court-day/:eventId/bundle`) | `agenda` | one payload: case header, hearing, checklist, doc list + signed URLs — enables offline prefetch |
| B5 | Mobile-friendly pagination/filter review on `cases`, `tasks`, `documents` | existing | verify cursors + lightweight list DTOs; add only if missing |

## Phases

### Phase 0 — Foundation (blocking everything)

- [x] Scaffold `apps/mobile` (Expo, TS, ESLint config from repo), wire pnpm workspace + CI
- [x] API client generated/typed from `packages/shared`; auth flow (login, refresh, multi-firm switch)
- [x] Secure storage + biometric app lock (Face ID/passcode gate, re-lock after 1 min in background)
- [x] TanStack Query + AsyncStorage persistence (MMKV requires a dev build; revisit); offline mutation queue still TODO
- [x] Push notification plumbing (B1 device-token API + B2 push in reminder scheduler; delivery needs a dev build — Expo Go dropped remote push)
- [x] Design tokens: navy `#182B49`, brass `#A67C2E`, semantic green/red; fonts Anuphan + IBM Plex Sans Thai; icons **Lucide** (`lucide-react-native`); large touch targets (min 44pt)
- [~] TH-only + Buddhist-era date utils done; camera + file upload helper (documents storage)

### Phase 1 — Lawyer's day (MVP release)

- [x] **My Day** — today's hearings, due tasks, stat cards (dashboard + agenda APIs)
- [x] **Court Day mode** (checklist/notes/outcome save; B4 bundle prefetch still TODO) — offline-prefetched bundle (B4): case header, required docs, checklist, hearing-result note + next-hearing capture; dark high-contrast screen
- [x] **Cases** — list with search/filter (Own Ref, status, Case Owner); detail with 4 tabs: overview / hearings / tasks / documents
- [x] **Calendar + deadlines** — month/day views, court + deadline merge, Outlook sync indicator
- [x] **Tasks** (optimistic tick; assign/reminders TODO) — my tasks, optimistic tick, assign, due reminders
- [x] **Notifications center** — Action Center feed (/agenda/actions) + bell badge + push deep links
- [x] **Team Workload dashboard** (B3 shipped; reassign via long-press on case task rows) — per-person load bars, overload flags, tap-through to person's task list, reassign inline
- [ ] QA pass with `josh-qa`-style checklist; release TestFlight/internal track

### Phase 2 — Documents, clients, money

- [x] Document scanner: camera capture → multi-page PDF (pdf-lib) → upload to case folder (edge crop needs a dev-build lib; NOTE: upload is ADMIN-only by policy — open decision whether lawyers may upload from court)
- [x] Document viewer — tap to download (auth) into cache and open via OS share sheet
- [x] Clients directory: search, contacts with call/email actions, client's cases
- [x] Expenses: photo receipt, amount, category chips, billable flag, submit-claim flow (per-case link + travel km TODO)
- [x] Quick intake form → existing intake pipeline
- [x] Insurance claims status card on case overview (field updates stay on web)

### Phase 3 — Team, reports, portal

- [ ] Operations queue + on-hold actions (owner/lead persona)
- [ ] Reports: read-only summary cards (open/closed cases, expenses, team load)
- [ ] Knowledge / Playbooks read-only search
- [ ] Decide: Client Portal as mode-in-app vs separate app (spike + ADR in `docs/adr/`)

### Stays web-only

Admin/SaaS billing, Practice Setup / Case Types / Templates, Email Intake & Outlook
configuration, full Document Review, Report Builder, Audit Log, Closing Email,
Intelligence tuning.

## Definition of done per phase

- Unit tests for API changes; mobile screens have component tests for critical logic
  (offline queue, court-day bundle rendering)
- Works on iPhone SE-size screens and Android low-end; TH locale verified
- Offline: Court Day readable in airplane mode after prefetch
- Speed budget: cold open → My Day rendered from cache < 1.5s; tap → screen < 300ms perceived

## Open decisions

1. Confirm React Native/Expo vs Flutter (recommendation: RN/Expo).
2. Client Portal delivery (Phase 3 spike).
3. Push provider: bare FCM/APNs via Expo vs OneSignal.
