# 0003. Client Portal stays responsive web, not a mode in the lawyer app

Date: 2026-09-14
Status: Accepted

## Context

Phase 3 of the mobile plan required deciding how clients reach LexFlow from a
phone: a mode inside the lawyer app (`apps/mobile`), a separate client app, or
the existing responsive web portal (`apps/web` `(client-portal)` routes).

Facts that drove the decision:

- Portal users are **low-frequency**: a client checks status or uploads a
  document a few times over the life of a case. App-store installation is a
  real drop-off cost for that usage pattern.
- Portal auth is **invite/link-based** (`client-portal/invites`, set-password,
  verify) and already works in a mobile browser; deep links land correctly.
- The lawyer app's session model is firm-staff JWT. Mixing a second identity
  system (`CurrentPortalUser`) into the same binary adds security surface for
  no shared UI — the two personas share almost no screens.
- A separate client app doubles release/update overhead (two store listings,
  two review cycles) before the lawyer app has even shipped.

## Decision

The Client Portal remains the **responsive web app**. `apps/mobile` stays a
staff-only (lawyer/owner) app. No portal mode is added to it, and no separate
client app is built now.

## Consequences

- Portal work continues in `apps/web` `(client-portal)`; keep those pages
  mobile-friendly (they are the portal's "mobile app").
- Client-facing push is out of scope; the portal keeps notifying via LINE and
  email, which clients already use.
- Revisit only if usage data shows clients returning frequently enough that
  installation pays for itself (e.g. insurance-claim clients with weekly
  updates); the trigger should be data, not a feature request.
