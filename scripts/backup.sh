#!/usr/bin/env bash
# Nightly backup on the prod EC2 host: Postgres dump (RDS) + uploads volume,
# kept RETENTION_DAYS days. Called by .github/workflows/backup.yml, or manually:
#   cd $EC2_APP_DIR && bash scripts/backup.sh
# Restore test (run at least quarterly):
#   docker run --rm -i --network host postgres:17-alpine psql "$RESTORE_URL" < <(gunzip -c db-YYYYMMDD.sql.gz)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ -z "${DATABASE_URL:-}" ]; then
  DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"')"
fi

sudo mkdir -p "$BACKUP_DIR"

# pg_dump via a throwaway container so the host needs no postgres client.
docker run --rm --network host postgres:17-alpine \
  pg_dump "$DATABASE_URL" --no-owner --no-privileges \
  | gzip | sudo tee "$BACKUP_DIR/db-$STAMP.sql.gz" > /dev/null

# Uploaded files live in the api container's named volume.
docker compose -f "$COMPOSE_FILE" exec -T api tar -czf - -C /data uploads \
  | sudo tee "$BACKUP_DIR/uploads-$STAMP.tar.gz" > /dev/null

sudo find "$BACKUP_DIR" -name '*.gz' -mtime "+$RETENTION_DAYS" -delete

echo "backup ok: db-$STAMP.sql.gz + uploads-$STAMP.tar.gz in $BACKUP_DIR"
