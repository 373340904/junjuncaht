@echo off
chcp 65001 >nul
title JunjunChat
cd /d "%~dp0server"
"C:\Users\马到成功\AppData\Local\Programs\Python\Python313\python.exe" main.py
echo.
echo Server stopped. Press any key to exit.
pause >nul
