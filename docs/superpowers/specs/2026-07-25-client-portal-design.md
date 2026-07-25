# Client Portal — Design Spec

**Date:** 2026-07-25
**Status:** Approved, pending implementation plan
**Feature #1 of 3** (client portal → e-signature → conflict-of-interest check). Each feature is an independent subsystem with its own spec → plan → build cycle. This trio comes out of the SaaS deep-research report (2026-07-25): "Client Portal" is already promoted on the marketing landing page (`apps/web/src/lib/i18n/landing.ts`) but has no backing implementation — this spec closes that gap.

## Goal

Let a client's contact person log into a read-only web portal to check their own case status, next hearing date, documents the firm has explicitly published to them, and issued/paid invoices — without calling or messaging the firm to ask.

## Scope (MVP)

**In scope:**
- Passwordless login via emailed magic link (single-use, expiring token).
- Staff opts a `ClientContact` into portal access, per contact (off by default).
- Staff opts a `Document` into client visibility, per file (off by default) — closes the risk of leaking internal drafts/privileged work product.
- Portal shows, scoped to the logged-in contact's `Client`: list of cases with status, per-case detail (status, next hearing pulled from `CalendarEvent`), documents flagged visible, invoices with status `SENT` or `PAID` (never `DRAFT`).
- Every magic-link request and portal data access is written to the existing `AuditLog` (already `firmId`-scoped).

**Out of scope (later / separate features):**
- Document upload by the client.
- In-portal messaging/chat with the firm.
- Online invoice payment.
- LINE-based magic link — clients aren't linked to LINE user IDs anywhere in the schema today (only staff `User.lineUserId` is). Adding this requires its own client-facing LINE linking flow, mirroring the existing staff `line-link.service.ts`. Deliberate cut, not an oversight.
- Exposing the free-text `CaseActivity` feed — it may contain internal notes not meant for client eyes. The portal shows only the structured `Case.status` field and calendar-derived "next hearing," not the raw activity timeline.

## Architecture

**Separate auth realm, not an extension of staff RBAC.** The existing role system (`roles.guard.ts`, `case-access.service.ts`) is built entirely around `FirmMember` staff roles. Client identity does not go through it. Instead: a distinct JWT audience/secret, a dedicated guard, and a dedicated controller namespace, so a portal token can only ever reach client-portal endpoints — every query is server-side filtered by the token's `clientId`. A bug here is scoped to one client's own data, never staff data or other clients' data.

```
Client enters email on /portal/login
  → ClientPortalAuthService issues single-use ClientPortalLoginToken (mirrors PasswordResetToken)
  → EmailService (existing SendGrid integration) sends the magic link
  → client clicks link → /portal/verify exchanges token for a portal JWT
  → JWT stored in an httpOnly cookie, separate secret from staff JWT_SECRET
  → ClientPortalGuard validates on every /client-portal/* request
  → all queries filtered by clientContact.clientId (never trusts a client-supplied id)
```

## Data model changes

Additive only, no breaking changes to existing tables:

```prisma
model ClientContact {
  // ...existing fields...
  portalEnabled Boolean @default(false)
}

model Document {
  // ...existing fields...
  visibleToClient Boolean @default(false)
}

model ClientPortalLoginToken {
  id              String    @id @default(uuid())
  clientContactId String
  token           String    @unique
  expiresAt       DateTime
  usedAt          DateTime?
  createdAt       DateTime  @default(now())

  clientContact ClientContact @relation(fields: [clientContactId], references: [id], onDelete: Cascade)
}
```

`ClientPortalLoginToken` mirrors the existing `PasswordResetToken` shape deliberately, for consistency with the current codebase's auth-token pattern.

## Backend

New NestJS module `apps/api/src/client-portal/` (kept separate from `auth` so the existing staff auth module does not grow to serve two identities):

- `client-portal-auth.controller.ts` — `POST /client-portal/auth/request-link` (email in, always 200 regardless of match, to avoid leaking which emails exist), `POST /client-portal/auth/verify` (token in, portal JWT cookie out).
- `client-portal-auth.service.ts` — token generation/validation, rate-limits link requests per contact.
- `client-portal.controller.ts` — `GET /client-portal/me`, `GET /client-portal/cases`, `GET /client-portal/cases/:id`, `GET /client-portal/invoices`, `GET /client-portal/documents/:id/download`. All read-only.
- `client-portal.guard.ts` + `client-portal-jwt.strategy.ts` — separate passport strategy, separate env secret (`CLIENT_PORTAL_JWT_SECRET`).
- `client-portal.module.ts`.

Every request handled by the guard writes an `AuditLog` entry (`firmId` from the resolved client, action e.g. `CLIENT_PORTAL_LOGIN`, `CLIENT_PORTAL_VIEW_CASE`).

Staff-facing additions to existing modules:
- `apps/api/src/cases/` (or wherever `ClientContact` is managed) — endpoint/field to toggle `portalEnabled`.
- `apps/api/src/documents/` — endpoint/field to toggle `visibleToClient`.

## Frontend

New route group `apps/web/src/app/(client-portal)/portal/`, isolated from `(auth)` and `(dashboard)`:
- `/portal/login` — email entry.
- `/portal/check-email` — "we've sent you a link" confirmation state.
- `/portal/verify` — consumes the token from the URL, exchanges it, redirects to the dashboard.
- `/portal` — list of the client's cases with a status badge.
- `/portal/cases/[id]` — case detail: status, next hearing, flagged documents (download links), invoices (`SENT`/`PAID` only) with line items.

Staff-facing additions to the existing dashboard:
- Client/contact screen: a "เปิดใช้งาน Client Portal" toggle per `ClientContact`.
- Document list/detail within a case: a "เผยแพร่ให้ลูกความ" toggle per `Document`.

## Error handling

- Expired/used magic link → clear message, offer to request a new one.
- Portal JWT invalid/expired → redirect to `/portal/login`, no silent failure.
- Contact with `portalEnabled = false` requesting a link → same generic "check your email" response as a valid request (no enumeration signal), but no token is actually issued or emailed.
- Case/document/invoice queries always filter by the authenticated `clientContactId`'s `clientId` server-side; a client requesting an id outside their scope gets a 404, not a 403 (avoids confirming the id exists).

## Testing

- Unit: token generation/expiry/single-use logic; guard rejects tokens signed with the staff secret and vice versa; query scoping (a client cannot fetch another client's case/document/invoice by id).
- Integration: full magic-link flow (request → email content → verify → cookie set); document/invoice visibility filtering end-to-end (`DRAFT` invoice and unflagged document never appear in API responses).
- Manual: run the app, walk through login → dashboard → case detail as a seeded client contact.
