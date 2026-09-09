@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\VideoAutoCleaner\extract_bgm.ps1"
pause