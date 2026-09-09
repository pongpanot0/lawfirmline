# Intake create shorten + documents section unify

## Done
- Slimmed `/intake/new` to title, client, received date, optional files
- After create, still redirects to `/intake/[id]`
- Detail: merged expected-docs checklist + upload/analyze into one "เอกสารของเรื่องนี้" card
- Detail: added "แก้ไขรายละเอียด" modal for deferred fields (matter, referral, etc.)

## Files
- `apps/web/src/app/(dashboard)/intake/new/page.tsx`
- `apps/web/src/app/(dashboard)/intake/[id]/page.tsx`
