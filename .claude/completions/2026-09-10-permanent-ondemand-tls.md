# Completion: permanent firm TLS (on-demand + platform ask)

**Date**: 2026-09-10

## Problem

With `*.{$DOMAIN}` + `tls { on_demand }`, Caddy can take SNI for `api.` / `www.` through the on-demand path. `caddy-ask` returned 404 for those hosts → `ERR_SSL_PROTOCOL_ERROR` even when cert files existed on disk. Temporary fix: explicit host Caddyfile (no on-demand).

## Permanent fix

1. **`allowOnDemandTls`** — also allow platform hosts: apex, `www`, `api` under `ROOT_DOMAIN`. Still deny unknown / reserved firm-like slugs.
2. **`Caddyfile`** — single site: `{$DOMAIN}, www, api, *.{$DOMAIN}` all with `tls { on_demand }`; route `api` → API, everything else → web.
3. Keep **`ROOT_DOMAIN: ${DOMAIN}`** in `docker-compose.prod.yml` (must be present on EC2).
4. **`DEFAULT_ROOT_DOMAIN=samnuan.com`** (typo `samnaun` removed earlier).

## Deploy on EC2 (after API image has this ask change)

```bash
# 1) Ensure env
grep '^DOMAIN=' .env   # DOMAIN=samnuan.com
grep ROOT_DOMAIN docker-compose.prod.yml

# 2) Pull/rebuild API with the ask fix, recreate api
docker compose -f docker-compose.prod.yml pull api   # or deploy from CI
docker compose -f docker-compose.prod.yml up -d --force-recreate api

# 3) Verify ask
curl -sS 'https://api.samnuan.com/saas/caddy-ask?domain=api.samnuan.com'
# {"ok":true}
curl -sS 'https://api.samnuan.com/saas/caddy-ask?domain=thesiambarristers.samnuan.com'
# {"ok":true}
curl -sS -o /dev/null -w '%{http_code}\n' 'https://api.samnuan.com/saas/caddy-ask?domain=nope.samnuan.com'
# 404

# 4) Install permanent Caddyfile from repo, recreate caddy
# (copy Caddyfile then:)
docker compose -f docker-compose.prod.yml up -d --force-recreate caddy

# 5) Smoke
curl -sS -o /dev/null -w 'api:%{http_code}\n' https://api.samnuan.com/health
curl -sS -o /dev/null -w 'firm:%{http_code}\n' https://thesiambarristers.samnuan.com/
```

Until the new API is live, keep the explicit-host Caddyfile (no wildcard on-demand).
