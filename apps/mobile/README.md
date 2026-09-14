# LexFlow Mobile

React Native (Expo) app for lawyers working from the phone instead of a computer at court.

## Run

```bash
# from repo root
pnpm install
pnpm --filter @lawfirm/shared build

# start the API (port 3001), then:
cd apps/mobile
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3001 pnpm start
```

Open in Expo Go (scan the QR) or an iOS simulator (`pnpm ios`).
`EXPO_PUBLIC_API_URL` defaults to `https://api.samnuan.com` (production). Set it to
your machine's LAN IP to develop against a local backend.

## What's here (Phase 1)

- **วันนี้ (My Day)** — today's hearings, tasks, overdue and conflict warnings (`/agenda/my-day`, `/dashboard/stats`)
- **คดี (Cases)** — search + list, detail with ภาพรวม/นัดหมาย/งาน/เอกสาร tabs
- **ปฏิทิน (Calendar)** — Buddhist-era month grid + day agenda (`/calendar/events`)
- **งาน (Tasks)** — my todos with optimistic done/undone (`/todos`)
- **ทีม (Team Workload)** — per-lawyer load bars, overload flags (`/dashboard/workload`, new endpoint)
- **Court Day** — dark offline-readable hearing screen with checklist, notes, and outcome save
  (`/calendar/events/:id/court-day`)

Speed-first: TanStack Query renders from the AsyncStorage-persisted cache instantly
(7-day retention, so a court day stays readable offline), then refetches behind it.
Auth tokens live in expo-secure-store with single-flight refresh on 401.

## Not yet (Phase 1 leftovers)

- Push notifications + in-app notification center (needs device-token API — B1/B2 in the plan)
- Reassign-from-workload action (screen shows load; assignment still happens in task screens)
- Face ID / PIN app lock
