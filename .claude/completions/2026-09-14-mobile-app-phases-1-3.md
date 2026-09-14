# Mobile App — Phases 1–3 shipped (2026-09-14)

Branch: claude/mobile-app-features-ui-bc5825 · Commits: e26e826, f0059c2, 90d21cb, 9b0cea6 (+fixes)

- New Expo app `apps/mobile` (RN 0.85 / SDK 56 / React 19, TanStack Query + AsyncStorage cache-first, Expo Router, lucide, Anuphan font).
- Phase 1: My Day, Cases (4-tab detail), Calendar (พ.ศ.), Tasks (optimistic), Team Workload (new `GET /dashboard/workload`), Court Day offline, notifications feed (/agenda/actions) + push (DeviceToken model + `POST/DELETE /notifications/devices`, reminder scheduler pushes with /court-day deep link), Face ID lock, long-press reassign.
- Phase 2: camera→PDF scanner upload, doc open via share sheet, clients directory (call/email), expenses + receipt photo + submit claim, quick intake, insurance claim card.
- Phase 3: reports summary, knowledge search, Owner on-hold queue, ADR 0003 (client portal stays responsive web).
- Policy change (CEO): document upload/uploadVersion now ADMIN+LAWYER (spec updated).
- Migration `20260914120000_device_tokens` applied locally via psql + migrate resolve.
- Known limits: push delivery needs a dev build (Expo Go dropped remote push); offline mutation queue and travel-km expense TODO; UI plan/mockups artifact: https://claude.ai/code/artifact/4db6a0fe-5fa0-42b1-8bb3-40e46e6db078
