@echo off
rem JEO Editor - start the editor (same as the Desktop shortcut).
if not exist "%~dp0apps\jeo-desktop\runtime\electron.exe" (
  echo JEO Editor is not set up yet. Run setup.cmd first.
  pause
  exit /b 1
)
start "" "%~dp0apps\jeo-desktop\runtime\electron.exe" "%~dp0apps\jeo-desktop"
