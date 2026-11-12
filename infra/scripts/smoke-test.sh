#!/usr/bin/env bash
set -euo pipefail

echo "==> Validating docker compose configuration..."
docker compose config -q

for svc in velostream-postgres velostream-mediamtx; do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$svc" 2>/dev/null || true)"
  if [[ "$status" != "healthy" ]]; then
    echo "Container '$svc' is not healthy (status: '$status'). Run 'docker compose up -d' first." >&2
    exit 1
  fi
  echo "  [OK] $svc -> $status"
done

echo "==> Checking Postgres and MediaMTX..."
docker exec velostream-postgres pg_isready -U velostream -d velostream
curl -fsS "http://127.0.0.1:9997/v3/config/global/get" >/dev/null
echo "  [OK] MediaMTX API -> 200"

echo "All infrastructure smoke checks passed."

