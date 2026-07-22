#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE_FILE=${ELAB_COMPOSE_FILE:-/root/elabftw/docker-compose.yml}
IMAGE=${ELAB_IMAGE:-elabftw/elabimg@sha256:500b0bcaed1b3b9f825d5272cd517072cd32f3e22d5dc68ec6f72f5a532cb745}
BASELINE="$ROOT_DIR/ops/upstream-templates.sha256"
TEMPLATES=(dashboard.html edit.html head.html scope-button.html storage-view-edit.html view.html)

cd "$ROOT_DIR"

echo '[1/6] Unit tests'
npm test

echo '[2/6] Compose configuration'
docker compose -f "$COMPOSE_FILE" config --quiet

echo '[3/6] Container health'
test "$(docker inspect -f '{{.State.Status}}' elabftw)" = running
test "$(docker inspect -f '{{.State.Health.Status}}' elabftw)" = healthy
test "$(docker inspect -f '{{.State.Status}}' elabftw-mysql)" = running
test "$(docker inspect -f '{{.State.Health.Status}}' elabftw-mysql)" = healthy
test "$(docker inspect -f '{{.State.Status}}' elabftw-planner)" = running

echo '[4/6] Planner API'
curl --fail --silent --show-error http://127.0.0.1:4044/api/health \
  | node -e 'let s=""; process.stdin.on("data", d => s += d).on("end", () => { const v = JSON.parse(s); if (!v.ok) process.exit(1); });'

echo '[5/6] Mounted overrides'
while IFS= read -r runtime_name; do
  source_name=$runtime_name
  case "$runtime_name" in
    planner.php) source_name=elabftw-planner.php ;;
    planner-api.php) source_name=elabftw-planner-api.php ;;
  esac
  test -f "$ROOT_DIR/$source_name"
  cmp --silent "$ROOT_DIR/$source_name" "/www/elabftw-data/overrides/$runtime_name"
done < <(
  docker compose -f "$COMPOSE_FILE" config --format json \
    | node -e 'let s=""; process.stdin.on("data", d => s += d).on("end", () => { const c = JSON.parse(s); for (const v of c.services.web.volumes || []) { if (v.type === "bind" && v.source.startsWith("/www/elabftw-data/overrides/")) console.log(v.source.split("/").pop()); } });'
)

echo '[6/6] Upstream template baseline'
tmp=$(mktemp -d)
container=''
cleanup() {
  if [[ -n "$container" ]]; then docker rm "$container" >/dev/null 2>&1 || true; fi
  rm -rf "$tmp"
}
trap cleanup EXIT
container=$(docker create "$IMAGE")
for template in "${TEMPLATES[@]}"; do
  docker cp "$container:/elabftw/src/templates/$template" "$tmp/$template" >/dev/null
done
(cd "$tmp" && sha256sum --check "$BASELINE")

echo 'Preflight passed.'
