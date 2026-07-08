# serve-standalone.ps1 — serve the production storefront from the standalone bundle.
#
# WHY this exists: next.config.ts sets `output: 'standalone'`, which makes
# `npx next start` unusable (it errors / serves a stripped app). The standalone
# server is `.next/standalone/server.js`, but Next does NOT copy the static
# assets or `public/` into that dir — you must copy them yourself, or every
# /_next/static asset and public image 404s. This script does the copy and boots
# the server on the given port (default 4000, the verify port from CLAUDE.md).
#
#   npm run build              # first — emits .next/standalone
#   pwsh scripts/serve-standalone.ps1 [-Port 4000]
#
# Reads NEXT_PUBLIC_* from .env.local at BUILD time (already baked in), so just
# run after a build. Backend must be up on :9000 for card images to resolve.
#
# WORKTREE QUIRK: in a git worktree under .worktrees/<branch>/, Next infers the
# file-tracing root at the MAIN repo (walks up to its package-lock.json) and
# nests the bundle as .next/standalone/.worktrees/<branch>/server.js. So we
# probe for server.js (shallowest match, skipping bundled node_modules) instead
# of assuming the flat layout, and copy assets relative to wherever it landed.
#
# EBUSY FIX: node must NOT run from anywhere inside .next — a running server
# locks the tree it runs from, and `npm run build` cleans .next (not just
# .next/standalone; verified 2026-07-07), crashing with `EBUSY: rmdir` on
# whatever the server holds. So we mirror the bundle to .next-serve (OUTSIDE
# .next, gitignored) and boot from the copy; builds then run freely while a
# server is up. Restarting the server picks up the new build.

param([int]$Port = 4000)

$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot
$STANDALONE = Join-Path $ROOT '.next\standalone'
$SERVE = Join-Path $ROOT '.next-serve'

$server = Get-ChildItem -Path $STANDALONE -Recurse -Filter server.js -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
    Sort-Object { $_.FullName.Length } |
    Select-Object -First 1
if (-not $server) {
    throw "No server.js under .next/standalone -- run 'npm run build' first (output: standalone)."
}

# Mirror the bundle out of build territory (see EBUSY FIX above). robocopy exit
# codes 0-7 mean success (1 = files copied); >=8 is a real failure, usually a
# previous server still holding locks. robocopy returns non-zero on SUCCESS, so
# drop $ErrorActionPreference to Continue around it — otherwise pwsh 7.4+ with
# $PSNativeCommandUseErrorActionPreference=$true throws on the expected exit 1.
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
robocopy $STANDALONE $SERVE /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
$rc = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($rc -ge 8) {
    throw "robocopy .next\standalone -> .next-serve failed (exit $rc). Is an old serve-standalone server still running? Stop it and retry."
}
$APPDIR = $server.DirectoryName.Replace($STANDALONE, $SERVE)
$serverPath = $server.FullName.Replace($STANDALONE, $SERVE)

# Next emits the standalone server but leaves these for you to copy. Remove any
# previous copy first: Copy-Item into an existing dir would nest (static\static).
$staticDest = Join-Path $APPDIR '.next\static'
if (Test-Path $staticDest) { Remove-Item -Recurse -Force $staticDest }
Copy-Item -Recurse -Force (Join-Path $ROOT '.next\static') $staticDest
if (Test-Path (Join-Path $ROOT 'public')) {
    $publicDest = Join-Path $APPDIR 'public'
    if (Test-Path $publicDest) { Remove-Item -Recurse -Force $publicDest }
    Copy-Item -Recurse -Force (Join-Path $ROOT 'public') $publicDest
}

$env:PORT = "$Port"
$env:HOSTNAME = '127.0.0.1'
Write-Host "[serve-standalone] $serverPath -> http://localhost:$Port (Ctrl+C to stop)"
node $serverPath
