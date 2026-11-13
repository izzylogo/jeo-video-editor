# Shared helpers for the JEO Editor scripts (setup, update, report).
# every step checks its own result, so a warning on a tool's error stream must not stop the script
$ErrorActionPreference = "Continue"
$script:Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$script:Desktop = Join-Path $Root "apps\jeo-desktop"
$script:Web = Join-Path $Root "apps\web"
$script:ElectronVersion = "33.2.0"
$script:ElectronExe = Join-Path $Desktop "runtime\electron.exe"

function Say($text, $colour = "Gray") { Write-Host $text -ForegroundColor $colour }
function Step($number, $text) { Write-Host ""; Write-Host ("[{0}] {1}" -f $number, $text) -ForegroundColor Cyan }
function Good($text) { Write-Host ("  OK   " + $text) -ForegroundColor Green }
function Warn($text) { Write-Host ("  NOTE " + $text) -ForegroundColor Yellow }
function Bad($text) { Write-Host ("  STOP " + $text) -ForegroundColor Red }

function Ask($question) {
    if ($script:AssumeYes) { return $true }
    $answer = Read-Host ("  " + $question + " (Y/N)")
    return $answer -match "^(y|yes)$"
}

# "1.4.4" -> [version]; returns $null when the tool is missing
function ToolVersion($command, $arguments = "--version") {
    $found = Get-Command $command -ErrorAction SilentlyContinue
    if (-not $found) { return $null }
    try {
        $text = (& $command $arguments 2>&1 | Out-String)
        $match = [regex]::Match($text, "(\d+)\.(\d+)(\.(\d+))?")
        if ($match.Success) { return [version]("{0}.{1}.{2}" -f $match.Groups[1].Value, $match.Groups[2].Value, $(if ($match.Groups[4].Success) { $match.Groups[4].Value } else { "0" })) }
    } catch { }
    return [version]"0.0.0"
}

# The folder that holds projects, exports and your music/sounds/emoji.
function DataRoot {
    if ($env:JEO_DATA_DIR) { return $env:JEO_DATA_DIR }
    $legacy = (Resolve-Path (Join-Path $Root "..")).Path
    if ((Test-Path (Join-Path $legacy "projects")) -and (Test-Path (Join-Path $legacy "CLAUDE.md"))) { return $legacy }
    return (Join-Path $Root "data")
}

function PythonCommand {
    foreach ($candidate in "py", "python") {
        if (Get-Command $candidate -ErrorAction SilentlyContinue) {
            try { & $candidate --version *> $null; if ($LASTEXITCODE -eq 0) { return $candidate } } catch { }
        }
    }
    return $null
}

function MakeShortcut {
    $shell = New-Object -ComObject WScript.Shell
    $path = Join-Path ([Environment]::GetFolderPath("Desktop")) "JEO Editor.lnk"
    $link = $shell.CreateShortcut($path)
    $link.TargetPath = $ElectronExe
    $link.Arguments = '"' + $Desktop + '"'
    $link.WorkingDirectory = $Desktop
    $icon = Join-Path $Desktop "icon.ico"
    if (Test-Path $icon) { $link.IconLocation = $icon }
    $link.Description = "JEO Editor"
    $link.Save()
    return $path
}
