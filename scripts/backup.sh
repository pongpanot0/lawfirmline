#!/usr/bin/env bash
# Nightly backup on the prod EC2 host: Postgres dump (RDS) + uploads volume.
# Called by .github/workflows/backup.yml, or manually:
#   cd $EC2_APP_DIR && bash scripts/backup.sh
# With BACKUP_S3_BUCKET set (in .env), each run is also copied offsite to S3;
# the bucket's lifecycle rule owns long-term retention, the disk keeps a few days.
# Restore test (run at least quarterly):
#   aws s3 cp s3://$BACKUP_S3_BUCKET/YYYYMM/db-YYYYMMDD-HHMMSS.sql.gz .
#   docker run --rm -i --network host postgres:17-alpine psql "$RESTORE_URL" < <(gunzip -c db-YYYYMMDD-HHMMSS.sql.gz)
set -euo pipefail

env_value() { grep "^$1=" .env | cut -d= -f2- | tr -d '"' || true; }

BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DATABASE_URL="${DATABASE_URL:-$(env_value DATABASE_URL)}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-$(env_value BACKUP_S3_BUCKET)}"
# The 8 GB root disk also runs the app: keep only a short local window once S3 holds the real copies.
RETENTION_DAYS="${RETENTION_DAYS:-$([ -n "$BACKUP_S3_BUCKET" ] && echo 3 || echo 14)}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILES=("db-$STAMP.sql.gz" "uploads-$STAMP.tar.gz")

sudo mkdir -p "$BACKUP_DIR"

# pg_dump via a throwaway container so the host needs no postgres client.
docker run --rm --network host postgres:17-alpine \
  pg_dump "$DATABASE_URL" --no-owner --no-privileges \
  | gzip | sudo tee "$BACKUP_DIR/${FILES[0]}" > /dev/null

# Uploaded files live in the api container's named volume.
docker compose -f "$COMPOSE_FILE" exec -T api tar -czf - -C /data uploads \
  | sudo tee "$BACKUP_DIR/${FILES[1]}" > /dev/null

if [ -n "$BACKUP_S3_BUCKET" ]; then
  # Fails the run (and the workflow) before local pruning if the offsite copy did not land.
  for f in "${FILES[@]}"; do
    aws s3 cp "$BACKUP_DIR/$f" "s3://$BACKUP_S3_BUCKET/${STAMP:0:6}/$f" \
      --region ap-southeast-7 --storage-class STANDARD_IA --only-show-errors
  done
  echo "offsite ok: s3://$BACKUP_S3_BUCKET/${STAMP:0:6}/"
else
  echo "WARNING: BACKUP_S3_BUCKET not set in .env, backups exist only on this host's disk"
fi

sudo find "$BACKUP_DIR" -name '*.gz' -mtime "+$RETENTION_DAYS" -delete

echo "backup ok: ${FILES[*]} in $BACKUP_DIR (local copies kept $RETENTION_DAYS days)"
