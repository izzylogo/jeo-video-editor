<#
  JEO Editor - check this installation and write JEO-REPORT.md.

  The report says what computer this is, which tools are installed, whether
  the editor starts and can do real edits, and how long things took. Nothing
  is sent anywhere: you send the file yourself to whoever shared the editor.
  Your Windows user name is replaced by "<you>" in every path.
#>
param([switch]$Quiet)
. (Join-Path $PSScriptRoot "common.ps1")

function Hide($text) { return ([string]$text).Replace($env:USERPROFILE, "C:\Users\<you>").Replace($env:USERNAME, "<you>") }
$lines = New-Object System.Collections.Generic.List[string]
function Add($text = "") { $lines.Add((Hide $text)) }
$checks = New-Object System.Collections.Generic.List[object]
function Check($name, $ok, $detail = "") { $checks.Add([pscustomobject]@{ Name = $name; Ok = [bool]$ok; Detail = (Hide $detail) }) }

if (-not $Quiet) { Write-Host ""; Write-Host "  JEO Editor report" -ForegroundColor Magenta }

# ---------- the computer ----------
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = (Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) -join "; "
$ramGb = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$drive = Get-PSDrive -Name $Root.Substring(0, 1)
$screen = try { Add-Type -AssemblyName System.Windows.Forms; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "$($b.Width) x $($b.Height)" } catch { "unknown" }

# ---------- tools ----------
$git = ToolVersion "git"; $node = ToolVersion "node"; $bun = ToolVersion "bun"
$python = PythonCommand
$pythonVersion = if ($python) { (& $python --version 2>&1 | Out-String).Trim() } else { "" }
$opencv = $false; if ($python) { & $python -c "import cv2, numpy" 2>$null; $opencv = ($LASTEXITCODE -eq 0) }
$claude = [bool](Get-Command claude -ErrorAction SilentlyContinue)
$capcut = Test-Path (Join-Path $env:LOCALAPPDATA "CapCut\Apps\CapCut.exe")

Check "Git" ($null -ne $git) "$git"
Check "Node.js 20 or newer" ($node -and $node -ge [version]"20.0.0") "$node"
Check "Bun 1.2 or newer" ($bun -and $bun -ge [version]"1.2.0") "$bun"
Check "Code packages installed" (Test-Path (Join-Path $Root "node_modules")) ""
Check "Settings file apps\web\.env.local" (Test-Path (Join-Path $Web ".env.local")) ""
Check "Editor is built" (Test-Path (Join-Path $Web ".next\BUILD_ID")) ""
Check "Electron window program" (Test-Path $ElectronExe) ""
Check "Caption font file (LEMON MILK)" (Test-Path (Join-Path $Web "public\fonts\jeo\LEMONMILK-Bold.otf")) ""
$data = DataRoot
Check "Data folder" (Test-Path (Join-Path $data "projects")) $data
Check "Desktop shortcut" (Test-Path (Join-Path ([Environment]::GetFolderPath("Desktop")) "JEO Editor.lnk")) ""

# ---------- does it really run? ----------
$self = $null; $selfError = ""; $selfSeconds = 0
if ((Test-Path $ElectronExe) -and (Test-Path (Join-Path $Web ".next\BUILD_ID"))) {
    if (-not $Quiet) { Say "  starting a hidden test window (about a minute)..." }
    $temp = Join-Path $env:TEMP ("jeo-selftest-" + [Guid]::NewGuid().ToString("N").Substring(0, 8))
    New-Item -ItemType Directory -Force $temp | Out-Null
    $shot = Join-Path $Root "JEO-REPORT.png"
    $env:JEO_PORT = "3288"; $env:JEO_DATA_DIR = (Join-Path $temp "data"); $env:JEO_NO_CAPCUT_LAUNCH = "1"
    $watch = [Diagnostics.Stopwatch]::StartNew()
    try {
        $arguments = @("`"$Desktop`"", "--user-data-dir=`"$temp\profile`"", "--capture=`"$shot`"", "--eval-file=`"$(Join-Path $PSScriptRoot 'selftest.js')`"", "--capture-delay=12000")
        $process = Start-Process $ElectronExe -ArgumentList $arguments -PassThru
        if (-not $process.WaitForExit(240000)) { $process.Kill(); $selfError = "the test window did not finish in 4 minutes" }
        $selfSeconds = [int]$watch.Elapsed.TotalSeconds
        if (Test-Path "$shot.json") { $self = Get-Content "$shot.json" -Raw -Encoding utf8 | ConvertFrom-Json; Remove-Item "$shot.json" -Force }
        elseif (-not $selfError) { $selfError = "the test window closed without a result" }
    } catch { $selfError = $_.Exception.Message }
    finally {
        Remove-Item Env:JEO_PORT, Env:JEO_DATA_DIR, Env:JEO_NO_CAPCUT_LAUNCH -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
    }
} else { $selfError = "skipped: the editor is not built yet or Electron is missing" }

# ---------- write it ----------
Push-Location $Root
$commit = (git log -1 --format="%h (%cs) %s" 2>$null)
$branch = (git rev-parse --abbrev-ref HEAD 2>$null)
$origin = (git config --get remote.origin.url 2>$null)
Pop-Location
$failed = @($checks | Where-Object { -not $_.Ok }).Count
$selfSteps = if ($self) { @($self.steps) } else { @() }
$selfFailed = @($selfSteps | Where-Object { -not $_.ok }).Count
$verdict = if ($failed -eq 0 -and $self -and $selfFailed -eq 0) { "Everything checked out." } elseif (-not $self) { "Installed, but the run test did not complete: $selfError" } else { "$($failed + $selfFailed) thing(s) need a look (marked NO below)." }

Add "# JEO Editor report"
Add ""
Add ("Written {0}. **{1}**" -f (Get-Date -Format "d MMM yyyy, HH:mm"), $verdict)
Add ""
Add "## 1. This computer"
Add ""
Add "| | |"
Add "|---|---|"
Add "| Windows | $($os.Caption) (build $($os.BuildNumber)) |"
Add "| Processor | $($cpu.Name.Trim()) ($($cpu.NumberOfCores) cores) |"
Add "| Memory | $ramGb GB |"
Add "| Graphics | $gpu |"
Add "| Screen | $screen |"
Add ("| Free disk | {0:N1} GB on {1}: |" -f ($drive.Free / 1GB), $drive.Name)
Add ""
Add "## 2. The editor"
Add ""
Add "| | |"
Add "|---|---|"
Add "| Version | $commit |"
Add "| Branch | $branch |"
Add "| Downloaded from | $origin |"
Add "| Code folder | $Root |"
Add "| Data folder | $data |"
Add ""
Add "## 3. Installation checks"
Add ""
Add "| Check | Result | Detail |"
Add "|---|---|---|"
foreach ($check in $checks) { Add ("| {0} | {1} | {2} |" -f $check.Name, $(if ($check.Ok) { "yes" } else { "**NO**" }), $check.Detail) }
Add ""
Add "## 4. Optional extras"
Add ""
Add "| Extra | Here? | What it is for |"
Add "|---|---|---|"
Add ("| Python | {0} | Follow the head / speaker, CapCut import and export |" -f $(if ($python) { "yes ($pythonVersion)" } else { "no" }))
Add ("| OpenCV for Python | {0} | Follow the head / speaker |" -f $(if ($opencv) { "yes" } else { "no" }))
Add ("| Claude Code | {0} | The AI tab (needs your own Claude plan) |" -f $(if ($claude) { "yes" } else { "no" }))
Add ("| CapCut | {0} | Open in CapCut, Import from CapCut |" -f $(if ($capcut) { "yes" } else { "no" }))
Add ""
Add "## 5. Does it really run?"
Add ""
if ($self) {
    Add "A hidden editor window was started with a throwaway project. It took $selfSeconds seconds from start to finish."
    Add ""
    Add "| Step | Result | Detail |"
    Add "|---|---|---|"
    foreach ($item in $selfSteps) { Add ("| {0} | {1} | {2} |" -f $item.name, $(if ($item.ok) { "yes" } else { "**NO**" }), $item.detail) }
    Add ""
    Add "A picture of that test window is saved next to this file as ``JEO-REPORT.png``. Please send it too."
} else { Add "The run test did not complete: $selfError" }
Add ""
Add "## 6. In your own words"
Add ""
Add "Please write a line or two under each question before you send this file."
Add ""
Add "1. Did the setup finish without you having to fix anything by hand?"
Add ""
Add "2. How long did the whole setup take, roughly?"
Add ""
Add "3. When you opened the editor and imported a video, did it play smoothly, with sound?"
Add ""
Add "4. What was confusing, slow or broken?"
Add ""
Add "5. What would you add or change?"
Add ""
[IO.File]::WriteAllLines((Join-Path $Root "JEO-REPORT.md"), $lines, (New-Object System.Text.UTF8Encoding $false))

if ($Quiet) { Write-Host ("  " + $verdict) -ForegroundColor $(if ($verdict -like "Everything*") { "Green" } else { "Yellow" }) }
else {
    foreach ($check in $checks) { if ($check.Ok) { Good $check.Name } else { Bad $check.Name } }
    foreach ($item in $selfSteps) { if ($item.ok) { Good $item.name } else { Bad ("{0}  {1}" -f $item.name, $item.detail) } }
    Write-Host ""; Write-Host ("  " + $verdict) -ForegroundColor $(if ($verdict -like "Everything*") { "Green" } else { "Yellow" })
    Say "  Report: $(Join-Path $Root 'JEO-REPORT.md')"
    Say "  Fill in part 6, then send that file (and JEO-REPORT.png) to the person who shared the editor."
}
