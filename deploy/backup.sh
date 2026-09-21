#!/bin/sh
# Sauvegarde quotidienne de la base. Cron : 0 3 * * * /opt/codeval/deploy/backup.sh
set -eu
cd "$(dirname "$0")/.."
DEST=/var/backups/codeval
KEEP_DAYS=14
mkdir -p "$DEST"
FILE="$DEST/codeval-$(date +%Y%m%d-%H%M).sql.gz"
docker compose -f docker-compose.prod.yml --env-file deploy/.env exec -T db \
  pg_dump -U codeval --clean --if-exists codeval | gzip > "$FILE"
find "$DEST" -name 'codeval-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "Sauvegarde : $FILE"
