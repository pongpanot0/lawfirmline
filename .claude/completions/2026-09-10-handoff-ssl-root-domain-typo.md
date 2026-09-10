# Completion: handoff SSL failure (ROOT_DOMAIN typo)

**Date**: 2026-09-10  
**Symptom**: `https://thesiambarristers.samnuan.com/handoff#...` → browser `ERR_SSL_PROTOCOL_ERROR`

## Root cause

Domain typo split across web vs API:

| Layer | Domain in use | Effect |
|-------|---------------|--------|
| Real DNS + Caddy | `samnuan.com` | Host resolves to EC2 |
| Web build (`NEXT_PUBLIC_ROOT_DOMAIN` / GH `secrets.DOMAIN`) | `samnuan.com` | Login redirects to firm handoff on correct host |
| API `ROOT_DOMAIN` (runtime / default) | `samnaun.com` (typo) | `GET /saas/caddy-ask?domain=thesiambarristers.samnuan.com` → **404** |

Caddy on-demand TLS asks the API; 404 aborts the handshake → `tlsv1 alert internal error` / `ERR_SSL_PROTOCOL_ERROR`.

Proof:

```text
caddy-ask?domain=thesiambarristers.samnuan.com  → 404 Unknown firm host
caddy-ask?domain=thesiambarristers.samnaun.com → 200 {"ok":true}
apex https://samnuan.com                       → 200
```

## Code fix (this change)

- `DEFAULT_ROOT_DOMAIN`: `samnaun.com` → `samnuan.com`
- Dockerfile / railway example / unit tests / design spec updated to match

## Ops (required for prod)

1. On the EC2 / compose host, set `DOMAIN=samnuan.com` (not `samnaun.com`) so API `ROOT_DOMAIN=${DOMAIN}` matches DNS.
2. Restart API (and Caddy if needed).
3. Re-check: `curl -i 'https://api.samnuan.com/saas/caddy-ask?domain=thesiambarristers.samnuan.com'` → **200**.
4. Open firm host again; first visit may take a few seconds while LE issues the cert.

## Security note

User pasted live access + refresh JWTs in chat. Treat as compromised: sign out / rotate session, avoid sharing handoff URLs with hash tokens.
