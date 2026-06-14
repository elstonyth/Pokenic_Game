#!/usr/bin/env pwsh
# Prod-parity preflight — build + boot the REAL prod Dockerfiles locally against
# a self-signed-SSL Postgres + Valkey (docker-compose.prod.yml), then assert the
# backend boots clean and serves /health, /dashboard, /seller. Run before every
# push: catches the redis-module / sessions / self-signed-CA / vite-base /
# blank-dashboard bug classes in ~1 min instead of a 5–10 min cloud round-trip.
#
#   pwsh scripts/preflight.ps1                  # backend stack
#   pwsh scripts/preflight.ps1 -WithStorefront  # + storefront on :4010
#   pwsh scripts/preflight.ps1 -Down            # tear down (and volumes)
#
[CmdletBinding()]
param(
  [switch]$WithStorefront,
  [switch]$Down,
  [switch]$Keep   # leave the stack up after a PASS (default tears down)
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.prod.yml'))
if ($WithStorefront) { $compose += @('--profile', 'storefront') }

function Invoke-Compose { docker @compose @args }

if ($Down) {
  docker compose -f (Join-Path $root 'docker-compose.prod.yml') down -v --remove-orphans
  return
}

$fail = [System.Collections.Generic.List[string]]::new()

Write-Host '==> Building + starting prod-parity stack (first build is slow)...' -ForegroundColor Cyan
# No --wait: the one-shot migrate service exits 0 and would trip --wait. We poll
# backend health below instead (depends_on still enforces migrate -> backend order).
Invoke-Compose up --build -d
if ($LASTEXITCODE -ne 0) {
  Write-Host 'compose up/build failed — dumping recent logs:' -ForegroundColor Red
  Invoke-Compose logs --tail 80
  throw 'Stack did not build/start.'
}

Write-Host '==> Waiting for backend /health (up to ~180s)...' -ForegroundColor Cyan
$healthy = $false
foreach ($i in 1..60) {
  try {
    $r = Invoke-WebRequest -Uri 'http://localhost:9000/health' -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $healthy = $true; break }
  }
  catch { }
  Start-Sleep -Seconds 3
}
if (-not $healthy) {
  Write-Host 'backend never became healthy — dumping logs:' -ForegroundColor Red
  Invoke-Compose logs --tail 120 migrate backend
  throw 'backend /health did not return 200 in time.'
}

function Test-Http([string]$name, [string]$url, [int]$minLen = 1) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    if ($r.StatusCode -eq 200 -and $r.Content.Length -ge $minLen) {
      Write-Host "  PASS  $name ($url) -> 200, $($r.Content.Length) bytes" -ForegroundColor Green
    }
    else {
      Write-Host "  FAIL  $name ($url) -> $($r.StatusCode), $($r.Content.Length) bytes" -ForegroundColor Red
      $script:fail.Add($name)
    }
  }
  catch {
    Write-Host "  FAIL  $name ($url) -> $($_.Exception.Message)" -ForegroundColor Red
    $script:fail.Add($name)
  }
}

if ($WithStorefront) {
  Write-Host '==> Waiting for storefront /health (up to ~90s)...' -ForegroundColor Cyan
  foreach ($i in 1..30) {
    try {
      $r = Invoke-WebRequest -Uri 'http://localhost:4010/' -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { break }
    }
    catch { }
    Start-Sleep -Seconds 3
  }
}

Write-Host '==> HTTP checks' -ForegroundColor Cyan
Test-Http 'backend /health'   'http://localhost:9000/health'
Test-Http 'admin /dashboard'  'http://localhost:9000/dashboard' 200
Test-Http 'vendor /seller'    'http://localhost:9000/seller' 200
if ($WithStorefront) { Test-Http 'storefront /' 'http://localhost:4010/' 200 }

# SPA render check (browser). HTTP 200 above only proves the shell is served —
# the admin/vendor SPAs return 200 while client-rendering their OWN 404 if the
# baked router basename (__BASE__) doesn't match the mount path. This is the real
# gate for "dashboard not loaded".
Write-Host '==> SPA render check (browser)' -ForegroundColor Cyan
node (Join-Path $root 'scripts/check-dashboard-render.mjs') 'http://localhost:9000/dashboard/' 'http://localhost:9000/seller/'
if ($LASTEXITCODE -ne 0) { $fail.Add('spa-render') }

Write-Host '==> Log scan (boot-error signatures)' -ForegroundColor Cyan
$logs = (Invoke-Compose logs --no-color backend worker migrate 2>&1) -join "`n"
$signatures = @{
  'SELF_SIGNED_CERT_IN_CHAIN' = 'self-signed CA not handled (DB/Redis TLS)'
  'KnexTimeoutError'          = 'DB connection failed (often the CA issue)'
  'MemoryStore'               = 'sessions fell back to in-memory (REDIS not wired)'
  'Cannot destructure'        = 'redis module options shape wrong (workflow-engine nesting)'
}
foreach ($sig in $signatures.Keys) {
  if ($logs -match [regex]::Escape($sig)) {
    Write-Host "  FAIL  found '$sig' — $($signatures[$sig])" -ForegroundColor Red
    $fail.Add("log:$sig")
  }
  else {
    Write-Host "  PASS  no '$sig'" -ForegroundColor Green
  }
}

Write-Host ''
if ($fail.Count -gt 0) {
  Write-Host "PREFLIGHT FAILED ($($fail.Count)): $($fail -join ', ')" -ForegroundColor Red
  Write-Host 'Inspect: docker compose -f docker-compose.prod.yml logs <service>' -ForegroundColor Yellow
  Write-Host 'Stack left running for debugging. Tear down: pwsh scripts/preflight.ps1 -Down' -ForegroundColor Yellow
  exit 1
}

Write-Host 'PREFLIGHT PASSED — prod images boot clean and serve dashboards.' -ForegroundColor Green
if (-not $Keep) {
  Write-Host '==> Tearing down (pass -Keep to leave it up).' -ForegroundColor Cyan
  Invoke-Compose down -v --remove-orphans
}
