# Safe "supabase db push" for this repo (Windows PowerShell).
#
# Why this exists: two pairs of migrations share a number (0042 and 0046, see SHARED_NUMBERS in
# scripts/check-migrations.mjs). The live database recorded each number once, so `supabase db push` believes the
# second file of each pair was never applied and offers to re-run it with --include-all. Re-running
# 0046_store_offers would undo the fix made in 0051. So those two files are hidden for the push and always put back.
#
# Usage, from the repo root:   powershell -ExecutionPolicy Bypass -File scripts\db-push.ps1
# It previews first (dry run), shows what would be applied, and asks before pushing.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$hidden = @("0042_search_postgis.sql", "0046_store_offers.sql")
$dir = Join-Path $root "supabase\migrations"
$stash = Join-Path $env:TEMP ("epicmkt-migrations-" + [guid]::NewGuid().ToString("N"))

function Restore-Hidden {
  foreach ($name in $hidden) {
    $from = Join-Path $stash $name
    $to = Join-Path $dir $name
    if ((Test-Path $from) -and -not (Test-Path $to)) { Move-Item $from $to }
  }
  if (Test-Path $stash) { Remove-Item $stash -Recurse -Force -ErrorAction SilentlyContinue }
}

New-Item -ItemType Directory -Path $stash | Out-Null
try {
  foreach ($name in $hidden) {
    $file = Join-Path $dir $name
    if (Test-Path $file) { Move-Item $file (Join-Path $stash $name) }
  }

  Write-Host "`n== Preview (nothing is changed) ==" -ForegroundColor Cyan
  npx supabase db push --dry-run
  if ($LASTEXITCODE -ne 0) { throw "The preview failed. Nothing was pushed." }

  $answer = Read-Host "`nPush the migrations listed above to the LIVE database? Type YES to continue"
  if ($answer -ne "YES") { Write-Host "Cancelled. Nothing was pushed." -ForegroundColor Yellow; return }

  Write-Host "`n== Pushing ==" -ForegroundColor Cyan
  npx supabase db push
  if ($LASTEXITCODE -ne 0) { throw "The push failed." }
  Write-Host "`nDone." -ForegroundColor Green
}
finally {
  Restore-Hidden
  Write-Host "The two hidden migration files were put back." -ForegroundColor DarkGray
}
