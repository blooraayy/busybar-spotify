@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0companion\open-settings.ps1"
if errorlevel 1 pause
