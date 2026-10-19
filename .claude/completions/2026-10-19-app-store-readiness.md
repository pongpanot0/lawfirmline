# App Store readiness (iOS) — 2026-10-19

- Mobile register screen: removed "ทดลองใช้งาน 30 วัน" (App Store 3.1.1: no trial/paid wording in the iOS app).
- `apps/mobile/app.json`: listed `expo-notifications` plugin explicitly; `expo config --type introspect` shows `aps-environment`.
- Account deletion requests now email `PLATFORM_ADMIN_EMAILS` (fallback hello@samnuan.com) with a 30-day due date; email failure never fails the request (`AccountService.notifyOperators`).
- Mobile + web delete-account copy promises completion within 30 days (`DELETION_DUE_DAYS`).
- Apple side: APNs key 6984JYKH2F created (team 6NHDK3U542). App Store Connect API key still blocked: account returns INVALIDITCUSER (new enrollment).
