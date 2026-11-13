@echo off
rem JEO Editor - check this installation and write JEO-REPORT.md
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jeo\report.ps1" %*
echo.
pause
