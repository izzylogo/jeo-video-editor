<#
  JEO Editor - first-time setup for Windows 10/11.

  What it does, in order. Nothing outside this folder is changed except:
  a "JEO Editor" shortcut on your Desktop, and (only if you say yes) Bun,
  Node.js, Git or two Python packages installed for your Windows user.

    1. checks Windows, free disk space, Git, Node.js and Bun
    2. creates the small settings file the editor needs (.env.local)
    3. installs the editor's code packages          (about 1.6 GB, 5-20 min)
    4. downloads the Electron window program         (about 110 MB download, 270 MB on disk)
    5. builds the editor                             (2-6 min)
    6. optional: Python packages for "follow the head" and CapCut import/export
    7. creates your data folders and the Desktop shortcut
    8. writes JEO-REPORT.md so you can tell the author how it went

  Options:
    -Yes                 answer "yes" to every question
    -SkipPython          do not offer the Python packages
    -ElectronFrom <dir>  copy Electron from a folder instead of downloading it
    -NoShortcut          do not create or change the Desktop shortcut (for testing a second copy)
#>
param([switch]$Yes, [switch]$SkipPython, [switch]$NoShortcut, [string]$ElectronFrom = "")
. (Join-Path $PSScriptRoot "common.ps1")
$script:AssumeYes = [bool]$Yes
$ProgressPreference = "SilentlyContinue"

Write-Host ""
Write-Host "  JEO Editor setup" -ForegroundColor Magenta
Write-Host "  ================" -ForegroundColor Magenta
Say "  Code folder: $Root"
Say ""
Say "  This will download about 1.7 GB and use about 2.5 GB of disk in this folder." "Yellow"
Say "  It needs the internet and takes 10 to 30 minutes depending on your connection." "Yellow"
Say "  Read the 'Before you install' part of README.md first if you have not." "Yellow"
if (-not (Ask "Start the setup now?")) { Say "  Nothing was changed."; exit 0 }

# ---------- 1. the computer ----------
Step 1 "Checking this computer"
if (-not [Environment]::Is64BitOperatingSystem -or $env:OS -ne "Windows_NT") { Bad "JEO Editor's setup is made for 64-bit Windows 10 or 11."; exit 1 }
Good ("Windows " + [Environment]::OSVersion.Version.ToString())
# Windows refuses file paths longer than 260 letters, and the code packages
# nest deeply. A long folder path here makes the install fail half way.
if ($Root.Length -gt 70) {
    Bad "This folder's path is too long ($($Root.Length) letters): $Root"
    Say "  Move the whole folder somewhere shorter, for example C:\jeo-video-editor or"
    Say "  Documents\jeo-video-editor, then run setup.cmd again."
    exit 1
}
Good "folder path is short enough ($($Root.Length) letters)"
$drive = Get-PSDrive -Name $Root.Substring(0, 1)
$freeGb = [Math]::Round($drive.Free / 1GB, 1)
if ($freeGb -lt 4) { Bad "Only $freeGb GB free on drive $($drive.Name):. At least 4 GB is needed."; exit 1 }
Good "$freeGb GB free on drive $($drive.Name):"

$needs = @(
    @{ Name = "Git"; Command = "git"; Min = [version]"2.30.0"; Winget = "Git.Git"; Why = "to download the editor and its updates" },
    @{ Name = "Node.js"; Command = "node"; Min = [version]"20.0.0"; Winget = "OpenJS.NodeJS.LTS"; Why = "runs the editor's local server" },
    @{ Name = "Bun"; Command = "bun"; Min = [version]"1.2.0"; Winget = "Oven-sh.Bun"; Why = "installs the code packages and builds the editor" }
)
$missing = @()
foreach ($tool in $needs) {
    $version = ToolVersion $tool.Command
    if ($null -eq $version) { Warn "$($tool.Name) is not installed ($($tool.Why))."; $missing += $tool }
    elseif ($version -lt $tool.Min) { Warn "$($tool.Name) $version is older than $($tool.Min)."; $missing += $tool }
    else { Good "$($tool.Name) $version" }
}
if ($missing.Count -gt 0) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    foreach ($tool in $missing) {
        if ($winget -and (Ask "Install $($tool.Name) now with Windows' own installer (winget)?")) {
            winget install --id $tool.Winget -e --accept-source-agreements --accept-package-agreements
        } else {
            Say "    To install it yourself, run:  winget install --id $($tool.Winget) -e"
        }
    }
    Say ""
    Bad "Close this window, open a NEW one (so Windows sees the new programs) and run setup.cmd again."
    exit 1
}

# ---------- 2. settings file ----------
Step 2 "Settings file"
$envLocal = Join-Path $Web ".env.local"
if (-not (Test-Path $envLocal)) { Copy-Item (Join-Path $Web ".env.example") $envLocal; Good "created apps\web\.env.local from the example" } else { Good "apps\web\.env.local is already there" }

# ---------- 3. code packages ----------
Step 3 "Installing the editor's code packages (about 1.6 GB; the slow step)"
Push-Location $Root
# --frozen-lockfile: install exactly the versions the author tested, and never
# rewrite a tracked file (that would block later updates)
bun install --frozen-lockfile
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Bad "The packages could not be installed. Check your internet connection and run setup.cmd again."; exit 1 }
Good "packages installed"

# ---------- 4. Electron ----------
Step 4 "The Electron window program (version $ElectronVersion)"
if (Test-Path $ElectronExe) { Good "already there" }
elseif ($ElectronFrom) {
    if (-not (Test-Path (Join-Path $ElectronFrom "electron.exe"))) { Bad "No electron.exe in $ElectronFrom"; exit 1 }
    New-Item -ItemType Directory -Force (Split-Path $ElectronExe) | Out-Null
    Copy-Item (Join-Path $ElectronFrom "*") (Split-Path $ElectronExe) -Recurse -Force
    Good "copied from $ElectronFrom"
} else {
    $base = "https://github.com/electron/electron/releases/download/v$ElectronVersion"
    $name = "electron-v$ElectronVersion-win32-x64.zip"
    $zip = Join-Path $env:TEMP $name
    Say "  downloading $name (about 110 MB) from github.com/electron/electron ..."
    Invoke-WebRequest "$base/$name" -OutFile $zip -UseBasicParsing
    # check the download against Electron's own published fingerprint
    $sums = (Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content
    # GitHub serves this file as raw bytes, so turn it into text first
    if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
    $line = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($name) + "\s*$" } | Select-Object -First 1)
    $expected = if ($line) { ($line.Trim() -split "\s+")[0].ToLower() } else { "" }
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if (-not $expected -or $expected -ne $actual) { Remove-Item $zip -Force; Bad "The Electron download did not match its published fingerprint. Run setup.cmd again."; exit 1 }
    Good "download matches Electron's published fingerprint"
    New-Item -ItemType Directory -Force (Split-Path $ElectronExe) | Out-Null
    Expand-Archive $zip -DestinationPath (Split-Path $ElectronExe) -Force
    Remove-Item $zip -Force
    if (-not (Test-Path $ElectronExe)) { Bad "Electron did not unpack correctly."; exit 1 }
    Good "Electron is in apps\jeo-desktop\runtime"
}

# ---------- 5. build ----------
Step 5 "Building the editor (2 to 6 minutes)"
Push-Location $Web
bun run build
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Bad "The build failed. Copy the red lines above and send them to the author."; exit 1 }
Good "built"

# ---------- 6. optional Python ----------
Step 6 "Optional: Python (for 'Follow the head / speaker' and CapCut import/export)"
$python = PythonCommand
if ($SkipPython) { Warn "skipped (you asked)" }
elseif (-not $python) { Warn "Python is not installed. Everything else works. To add it later: winget install --id Python.Python.3.12 -e, then run setup.cmd again." }
else {
    & $python -c "import cv2, numpy" 2>$null
    if ($LASTEXITCODE -eq 0) { Good "Python with OpenCV is ready" }
    elseif (Ask "Install the two Python packages it needs (opencv-python, numpy; about 80 MB)?") {
        & $python -m pip install --user opencv-python numpy
        if ($LASTEXITCODE -eq 0) { Good "installed" } else { Warn "could not install them; 'Follow the head' will not work until they are in" }
    } else { Warn "skipped; 'Follow the head / speaker' will not work until they are in" }
}
if (Get-Command claude -ErrorAction SilentlyContinue) { Good "Claude Code is installed (the AI tab will work with your own Claude plan)" }
else { Warn "Claude Code is not installed, so the AI tab will say so. Everything else works. See README.md, 'The AI tab'." }

# ---------- 7. folders + shortcut ----------
Step 7 "Your data folders and the Desktop shortcut"
$data = DataRoot
foreach ($folder in "projects", "output", "assets\music", "assets\sound-effects", "assets\emoji", "live") { New-Item -ItemType Directory -Force (Join-Path $data $folder) | Out-Null }
Good "data folder: $data"
if ($NoShortcut) { Warn "Desktop shortcut left alone (you asked)" } else { $shortcut = MakeShortcut; Good "shortcut: $shortcut" }

# ---------- 8. report ----------
Step 8 "Checking that it runs, and writing the report"
& (Join-Path $PSScriptRoot "report.ps1") -Quiet
Write-Host ""
Write-Host "  Setup finished." -ForegroundColor Green
Say "  Start the editor: double-click 'JEO Editor' on your Desktop, or run start.cmd."
Say "  Please send the file JEO-REPORT.md (in this folder) to the person who shared the editor with you." "Yellow"
