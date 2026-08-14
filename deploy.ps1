# Publishes this folder to https://github.com/arunkumarr1/weather and turns on
# GitHub Pages, so the app is reachable at
#   https://arunkumarr1.github.io/weather/
#
# Requires: gh signed in as arunkumarr1  ->  gh auth login
# Check with: gh auth status
#
# Safe to re-run. Later runs just push the new commit.

$ErrorActionPreference = "Stop"
$repo = "arunkumarr1/weather"
$root = $PSScriptRoot

Write-Host "Checking GitHub sign-in..." -ForegroundColor Cyan
$who = (gh api user --jq .login 2>$null)
if (-not $who) { throw "gh is not signed in. Run: gh auth login" }
Write-Host "  signed in as: $who"
if ($who -ne "arunkumarr1") {
    throw "gh is signed in as '$who', not 'arunkumarr1'. Run: gh auth switch"
}

Set-Location $root

if (-not (Test-Path (Join-Path $root ".git"))) {
    Write-Host "Setting up git repository..." -ForegroundColor Cyan
    git init -b main | Out-Null
    git remote add origin "https://github.com/$repo.git"
} else {
    git remote set-url origin "https://github.com/$repo.git"
}

# Identity is set on THIS repo only, so global/work git config is untouched.
# Uses GitHub's noreply address so a real email never lands in public history.
$uid = (gh api user --jq .id)
git config user.name "arunkumarr1"
git config user.email "$uid+arunkumarr1@users.noreply.github.com"

Write-Host "Committing..." -ForegroundColor Cyan
git add -A
git commit -m "Weather app: iOS-style PWA" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "  (nothing new to commit)" }

Write-Host "Pushing to $repo..." -ForegroundColor Cyan
git push -u origin main --force

Write-Host "Enabling GitHub Pages (main branch, /docs folder)..." -ForegroundColor Cyan
$body = '{"source":{"branch":"main","path":"/docs"}}'
try {
    $body | gh api "repos/$repo/pages" -X POST --input - | Out-Null
    Write-Host "  Pages enabled."
} catch {
    try {
        $body | gh api "repos/$repo/pages" -X PUT --input - | Out-Null
        Write-Host "  Pages already on; source updated."
    } catch {
        Write-Host "  Could not set Pages automatically." -ForegroundColor Yellow
        Write-Host "  Set it by hand: repo Settings > Pages > Source: main, folder: /docs"
    }
}

Write-Host ""
Write-Host "Done. Your app will be live in 1-2 minutes at:" -ForegroundColor Green
Write-Host "  https://arunkumarr1.github.io/weather/" -ForegroundColor Green
Write-Host ""
Write-Host "First deploy can take a little longer. If you get a 404, wait and refresh."
