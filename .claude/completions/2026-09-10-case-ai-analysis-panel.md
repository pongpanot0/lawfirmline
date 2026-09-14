# Case AI file analysis → top button + right panel

**Date:** 2026-09-10  
**Scope:** `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`

## Change
- Removed bottom `<details>` accordion for «วิเคราะห์เนื้อหาไฟล์ด้วย AI».
- Added outline button on the case tab bar (top-right): «วิเคราะห์ด้วย AI».
- Opens a fixed right-side dialog panel with `BatchAnalysisPanel`; backdrop + Escape/X close.
- Stays on `/cases/[id]` — no route change.

## Verify
1. Open a case overview → see button next to tabs.
2. Click → panel slides from right; URL unchanged; overview still behind backdrop.
3. Escape / backdrop / X closes panel.
