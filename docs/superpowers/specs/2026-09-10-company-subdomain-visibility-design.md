# Company isolation + subdomain + role visibility

**Date:** 2026-09-10  
**Status:** Implemented

## Summary

Multi-tenant firms are addressed by `Firm.id` (company id) and `Firm.slug` (subdomain on `samnaun.com`). The first customer is `thesiambarristers` → `https://thesiambarristers.samnaun.com`. Courts and deadline rules are platform-global; case types remain per-firm with defaults. Role visibility extends to clients and intake.

## Identity

| Field | Role |
|-------|------|
| `Firm.id` | Internal company id (UUID) |
| `Firm.slug` | Unique subdomain; reserved: www, api, app, admin, mail, portal, static, assets |

Login on a tenant host requires membership in that firm (`X-Firm-Slug` / Host). Register is apex-only.

## Visibility

| Role | Scope |
|------|--------|
| OWNER | All firm data |
| SENIOR_LAWYER | Own + LAWYER-scoped cases/tasks/intakes |
| LAWYER / ASSISTANT | Only self-involved (lead/buddy/assignee/receiver) |

Clients: non-owners only see clients with ≥1 visible case. Email threads: owners/seniors see all firm threads; lawyers only threads linked to visible intakes.

## Shared master data

- `Court` — global unique name
- `DeadlineRule` — global (`caseTypeId` null this pass)
- `PublicHoliday` — already global
- `CaseType` — per firm; seeded from `DEFAULT_CASE_TYPES`
