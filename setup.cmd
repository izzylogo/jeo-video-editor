@echo off
rem JEO Editor - first-time setup. Double-click, or run in a terminal.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jeo\setup.ps1" %*
echo.
pause
