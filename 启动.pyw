# JunjunChat 后端启动脚本（双击运行，无窗口）
import os
import sys
import subprocess

# 获取脚本所在目录
script_dir = os.path.dirname(os.path.abspath(__file__))
server_dir = os.path.join(script_dir, "server")
python_exe = r"C:\Users\马到成功\AppData\Local\Programs\Python\Python313\pythonw.exe"
main_py = os.path.join(server_dir, "main.py")

# 切换到 server 目录
os.chdir(server_dir)

# 启动后端
subprocess.Popen([python_exe, main_py], cwd=server_dir, creationflags=0x08000000)

print("JunjunChat 后端已启动！")
print("访问 https://localhost:8000/health 确认")
