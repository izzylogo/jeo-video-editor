@echo off
rem JEO Editor - get the newest version from GitHub. Close the editor first.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jeo\update.ps1" %*
echo.
pause
