@echo off
echo 正在停止 JunjunChat 后端...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a
    echo 已停止进程 %%a
)
echo 完成！
pause
