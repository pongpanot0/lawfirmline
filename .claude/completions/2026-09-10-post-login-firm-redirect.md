# Completion: post-login redirect to firm subdomain

**Date**: 2026-09-10  
**Issue**: After login on apex (`samnaun.com` / `localhost`), app stayed on `/dashboard` and never moved to `thesiambarrister.samnaun.com`.

## Root cause

1. Login used `router.push('/dashboard')` on the current host only.
2. `AuthUser` had no `firmSlug`, so the client could not build the tenant URL.
3. Tokens live in `localStorage` (origin-scoped), so a subdomain hop needs an explicit handoff.

## Fix

- Add `firmSlug` to `AuthUser` / `buildAuthUser`
- Shared helpers: `buildFirmAppOrigin`, `needsFirmHostRedirect`
- After login, redirect to `{slug}.{root}/handoff#access_token&refresh_token`
- `/handoff` stores tokens on the firm origin, then goes to `/dashboard`

## Target URL

`https://thesiambarrister.samnaun.com` (slug `thesiambarrister`, root `samnaun.com`)

Local: `http://thesiambarrister.localhost:3005`

## Infra also fixed

- Caddy serves `thesiambarrister.{$DOMAIN}` (not only apex/www)
- Web build gets `NEXT_PUBLIC_ROOT_DOMAIN`
- API gets `ROOT_DOMAIN` + firm origin in CORS
- Deploy workflow passes root domain build arg

**Ops:** add DNS A record `thesiambarrister.samnaun.com` → EC2 before redeploy.
