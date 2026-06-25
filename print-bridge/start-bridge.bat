@echo off
REM Put a shortcut to this file in shell:startup to auto-launch at boot.
cd /d "%~dp0"
node server.js
pause
