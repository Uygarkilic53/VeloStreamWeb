$ErrorActionPreference = "Stop"

Write-Host "==> Validating docker compose configuration..."
docker compose config -q
if ($LASTEXITCODE -ne 0) {
  throw "docker compose config validation failed"
}

Write-Host "==> Checking infrastructure container health..."
$services = @("velostream-postgres", "velostream-mediamtx")
foreach ($svc in $services) {
  $status = docker inspect --format "{{.State.Health.Status}}" $svc 2>$null
  if ($LASTEXITCODE -ne 0 -or $status -ne "healthy") {
    throw "Container '$svc' is not healthy (status: '$status'). Run 'docker compose up -d' first."
  }
  Write-Host "  [OK] $svc -> $status"
}

Write-Host "==> Checking Postgres readiness..."
docker exec velostream-postgres pg_isready -U velostream -d velostream
if ($LASTEXITCODE -ne 0) { throw "Postgres pg_isready failed" }

Write-Host "==> Checking MediaMTX API..."
$mtx = Invoke-WebRequest -Uri "http://127.0.0.1:9997/v3/config/global/get" -UseBasicParsing -TimeoutSec 5
if ($mtx.StatusCode -ne 200) { throw "MediaMTX API returned status $($mtx.StatusCode)" }
Write-Host "  [OK] MediaMTX API -> 200"

Write-Host "`nAll infrastructure smoke checks passed."

