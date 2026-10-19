# 2026-10-19 — Android push setup + daily-digest push

## Why
Push was wired end to end in code but Android had no Firebase config, so
`getExpoPushTokenAsync` failed silently and no Android device ever registered.

## Code
- `apps/mobile/app.config.js` — `android.googleServicesFile` from the
  `GOOGLE_SERVICES_JSON` EAS file env var (repo is public; file not committed,
  `google-services.json` gitignored).
- `DailyDigestScheduler` — short push at 18:00 ("พรุ่งนี้มี N รายการ") and a new
  08:00 cron ("วันนี้มี N รายการ"); tap opens `/(tabs)/calendar`. Deduped per day
  via `DailyDigestLog` channels `push-evening` / `push-morning`; LINE/email dedupe
  ignores push rows. All gated by `dailyDigestEnabled`.
- `PushService` — `ponytail:` note: Expo push receipts are not polled.

## Outside the repo (done)
- Firebase project `notifications-f8172` (renamed "Samnuan", account limit hit
  so an old project was reused), Android app `com.samnuan.app`, FCM V1 enabled.
- EAS: `GOOGLE_SERVICES_JSON` env var (all environments), FCM V1 service-account
  key assigned to `com.samnuan.app`. APNs key 6984JYKH2F already present.

## Not done
- New Android build + real-device test (assign → push, tap → deep link, badge,
  logout → no push; trigger digest schedulers manually).
- Receipt polling (deferred, see ponytail note).
