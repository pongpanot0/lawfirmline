# Completion: wildcard firm DNS + Caddy On-Demand TLS

**Date**: 2026-09-10

## Change

- DNS guidance: one `*.DOMAIN` A record (no per-company records)
- Caddy: `*.{$DOMAIN}` with `tls { on_demand }` + global `ask http://api:3001/saas/caddy-ask`
- API: `GET /saas/caddy-ask?domain=` → 200 only if firm slug exists under `ROOT_DOMAIN`
- CORS no longer hardcodes `thesiambarristers`

## Ops checklist

1. Add Route53 (or registrar) A: `*.samnaun.com` → EC2
2. Keep apex + `api` A records
3. Redeploy so Caddyfile + API ask endpoint ship together
4. First visit to a new firm host may take a few seconds while LE issues the cert
