<#
  JEO Editor - get the newest version from GitHub.
  The same thing the "Get update" button in the editor does, with everything
  shown on screen. Your projects (the data folder) are never touched.
  Close JEO Editor before running this.
#>
param([switch]$Yes)
. (Join-Path $PSScriptRoot "common.ps1")
$script:AssumeYes = [bool]$Yes

Write-Host ""
Write-Host "  JEO Editor update" -ForegroundColor Magenta
Push-Location $Root
try {
    Step 1 "Looking at GitHub"
    $before = (git rev-parse --short HEAD)
    git fetch --quiet
    if ($LASTEXITCODE -ne 0) { Bad "GitHub could not be reached. Check your internet connection."; exit 1 }
    $behind = [int](git rev-list --count "HEAD..@{upstream}")
    if ($behind -eq 0) { Good "You already have the newest version ($before)."; exit 0 }
    Say "  $behind new change(s):"
    git log "HEAD..@{upstream}" --format="    - %s" -n 12
    $dirty = (git status --porcelain --untracked-files=no)
    if ($dirty) { Bad "Files in this folder were changed by hand, so the update would clash:"; Say $dirty; Say "  Ask the author, or run: git stash   (then update.cmd again)"; exit 1 }
    if (-not (Ask "Download and install them now?")) { Say "  Nothing was changed."; exit 0 }

    Step 2 "Downloading the changes"
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Bad "The download did not fit on top of your copy."; exit 1 }
    Step 3 "Installing anything new"
    bun install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { Bad "The new packages could not be installed."; exit 1 }
    Step 4 "Building the new version (2 to 6 minutes)"
    Push-Location $Web; bun run build; $code = $LASTEXITCODE; Pop-Location
    if ($code -ne 0) { Bad "The build failed. Send the red lines above to the author."; exit 1 }
    Write-Host ""
    Write-Host ("  Updated from {0} to {1}. Start JEO Editor again." -f $before, (git rev-parse --short HEAD)) -ForegroundColor Green
} finally { Pop-Location }
