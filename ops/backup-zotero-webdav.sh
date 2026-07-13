#!/usr/bin/env bash
set -euo pipefail

source_dir="/www/data/zotero-webdav"
backup_dir="/www/backup/zotero-webdav"
log_dir="/www/logs/zotero-webdav"
log_file="${log_dir}/rclone-backup.log"
sentinel="${source_dir}/.zotero-webdav-root"
lock_file="/run/lock/zotero-webdav-backup.lock"
remote="gdrive:zotero-webdav-backup"
today="$(date +%F)"

mkdir -p "$backup_dir"
install -d -o root -g www-data -m 0750 "$log_dir"

exec 9>"$lock_file"
if ! flock -n 9; then
  printf '[%s] Zotero WebDAV backup already running\n' "$(date --iso-8601=seconds)" | tee -a "$log_file"
  exit 0
fi

printf '[%s] Starting Zotero WebDAV backup\n' "$(date --iso-8601=seconds)" | tee -a "$log_file"

if [[ ! -d "$source_dir" ]]; then
  printf 'Source directory does not exist: %s\n' "$source_dir" | tee -a "$log_file" >&2
  exit 1
fi

if [[ ! -f "$sentinel" ]]; then
  printf 'Sentinel missing, refusing to sync: %s\n' "$sentinel" | tee -a "$log_file" >&2
  exit 1
fi

if ! rclone lsd gdrive: >/dev/null 2>&1; then
  printf 'rclone remote "gdrive" is not configured or not reachable\n' | tee -a "$log_file" >&2
  exit 1
fi

rclone mkdir "$remote/current"
rclone mkdir "$remote/deleted-or-changed/${today}"

rclone sync "$source_dir" "$remote/current" \
  --backup-dir "$remote/deleted-or-changed/${today}" \
  --log-file "$log_file" \
  --log-level INFO

printf '[%s] Finished Zotero WebDAV backup\n' "$(date --iso-8601=seconds)" | tee -a "$log_file"
printf 'Zotero WebDAV backup completed\n'
