# LINE main menu carousel with images

**Date**: 2026-09-16

## Outcome

LINE bot main menu now replies with a template carousel (3 image cards: Case / Task / Todo) instead of text + quick reply. Action texts are unchanged (`สร้าง Case`, `เพิ่ม Task`, `สร้าง Todo`).

## Verify

- `pnpm --filter api test -- src/notifications/line-messaging.service.spec.ts`
- API on `:3001` serves:
  - `GET /line-assets/menu-case.jpg`
  - `GET /line-assets/menu-task.jpg`
  - `GET /line-assets/menu-todo.jpg`

LINE fetches images from `https://api.samnuan.com/line-assets/...` (or `API_PUBLIC_URL` when it is public HTTPS). Images appear in chat after this asset path is deployed.
