#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT=${ELAB_BACKUP_ROOT:-/www/elabftw-data/backups}
DATA_ROOT=${ELAB_DATA_ROOT:-/www/elabftw-data}
RETENTION_DAYS=${ELAB_BACKUP_RETENTION_DAYS:-14}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_ROOT/$timestamp"
partial="$BACKUP_ROOT/.$timestamp.partial"

cleanup() {
  rm -rf "$partial"
}
trap cleanup EXIT

install -d -m 0750 "$BACKUP_ROOT"
install -d -m 0750 "$partial"

docker exec elabftw-mysql sh -c \
  'export MYSQL_PWD="$MYSQL_PASSWORD"; exec mysqldump --single-transaction --quick --no-tablespaces --routines --triggers --events -u"$MYSQL_USER" "$MYSQL_DATABASE"' \
  | gzip -9 > "$partial/mysql.sql.gz"

tar -C "$DATA_ROOT" -czf "$partial/uploads.tar.gz" web exports
tar -C "$DATA_ROOT" -czf "$partial/custom-data.tar.gz" planner silverbullet-space overrides

gzip -t "$partial/mysql.sql.gz"
gzip -cd "$partial/mysql.sql.gz" | tail -n 5 | grep -q 'Dump completed on'
tar -tzf "$partial/uploads.tar.gz" >/dev/null
tar -tzf "$partial/custom-data.tar.gz" >/dev/null

(
  cd "$partial"
  sha256sum mysql.sql.gz uploads.tar.gz custom-data.tar.gz > SHA256SUMS
  sha256sum --check SHA256SUMS >/dev/null
)

mv "$partial" "$target"
trap - EXIT
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -name '20??????T??????Z' -exec rm -rf {} +

echo "Verified backup created: $target"
