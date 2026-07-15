# run-e2e.ps1 — run the Playwright E2E suite against any target env.
#
# The mutating suite (tests/e2e) reads PW_BASE / PW_ADMIN / PW_BACKEND / PW_PK /
# PW_ADMIN_EMAIL / PW_ADMIN_PASSWORD (see tests/e2e/helpers/constants.ts). This
# loader sets them from a key=val env file so you can point the suite at a
# staging stack without editing code.
#
#   pwsh scripts/run-e2e.ps1                              # localhost defaults
#   pwsh scripts/run-e2e.ps1 -EnvFile tests/e2e/.env.e2e # a staging target
#   pwsh scripts/run-e2e.ps1 -Smoke                      # read-only PROD smoke
#   pwsh scripts/run-e2e.ps1 -Grep "economy"            # subset
#
# ⚠ NEVER point the mutating suite at prod — it creates/deletes packs, adjusts
#   credits, and opens packs. Use -Smoke for prod (read-only).
param(
    [string]$EnvFile = "tests/e2e/.env.e2e",
    [switch]$Smoke,
    [string]$Grep
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Smoke) {
    Write-Host "[run-e2e] PROD read-only smoke" -ForegroundColor Cyan
    $pwArgs = @('playwright', 'test', '-c', 'playwright.prod-smoke.config.ts')
} else {
    if (Test-Path $EnvFile) {
        Get-Content $EnvFile | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith('#')) {
                $kv = $line -split '=', 2
                if ($kv.Count -eq 2) {
                    $name = $kv[0].Trim()
                    $val = $kv[1].Trim().Trim('"')
                    Set-Item -Path "Env:$name" -Value $val
                }
            }
        }
        Write-Host "[run-e2e] loaded target from $EnvFile (PW_BACKEND=$env:PW_BACKEND)" -ForegroundColor Cyan
    } else {
        Write-Host "[run-e2e] no $EnvFile — using localhost defaults" -ForegroundColor Yellow
    }
    if ($env:PW_BACKEND -match 'ondigitalocean|polycards-backend') {
        throw "Refusing to run the MUTATING suite against what looks like prod ($env:PW_BACKEND). Use -Smoke for prod."
    }
    $pwArgs = @('playwright', 'test')
}

if ($Grep) { $pwArgs += @('--grep', $Grep) }
$pwArgs += '--reporter=list'

Write-Host "[run-e2e] npx $($pwArgs -join ' ')"
& npx @pwArgs
