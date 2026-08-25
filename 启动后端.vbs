' JunjunChat 后端开机自启动脚本
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\马到成功\Doubao\chats\2026-08-25\new-chat\junjunchat-full\server"
WshShell.Run """C:\Users\马到成功\AppData\Local\Programs\Python\Python313\pythonw.exe"" main.py", 0, False
