"""
JunjunChat 机器人示例 - 君灵AI
功能：自动回复、命令处理、群聊互动
运行：python bot_junling.py
"""
import asyncio
import json
import websockets
import requests
from datetime import datetime

# ========== 配置 ==========
BOT_KEY = "jj_MB7qDSLCrB-q4tbT8R3aHo1lwJywmTuw"  # 你的机器人Key
API_BASE = "https://junjuncaht-production.up.railway.app"  # 注意：bot-api 没有 /api/v1 前缀
WS_URL = f"wss://junjuncaht-production.up.railway.app/bot/ws?key={BOT_KEY}"

# 机器人状态
bot_info = None
connected = False


def api_request(method, path, data=None):
    """调用 Bot API（注意：bot-api 路径不带 /api/v1 前缀）"""
    headers = {"Authorization": f"Bot {BOT_KEY}", "Content-Type": "application/json"}
    url = API_BASE + path
    if method == "GET":
        r = requests.get(url, headers=headers, timeout=10)
    else:
        r = requests.post(url, headers=headers, json=data, timeout=10)
    return r.json() if r.text else None


def send_message(conversation_id, message):
    """向会话发送消息"""
    try:
        api_request("POST", f"/bot-api/conversations/{conversation_id}/messages", {"message": message})
    except Exception as e:
        print(f"[发送失败] {e}")


def send_dm(user_id, message):
    """向用户发私信"""
    try:
        api_request("POST", f"/bot-api/users/{user_id}/messages", {"message": message})
    except Exception as e:
        print(f"[私信失败] {e}")


def handle_command(content, sender_name, conversation_id):
    """处理命令"""
    content = content.strip()

    # 帮助
    if content in ("/help", "/帮助", "帮助"):
        return """🤖 君灵AI 命令列表：
/help - 显示帮助
/ping - 测试连接
/时间 - 当前时间
/天气 [城市] - 查询天气（示例）
/joke - 讲个笑话
/about - 关于机器人
@我 + 内容 - 和我聊天"""

    # 测试
    if content in ("/ping", "/测试"):
        return "🏓 Pong! 机器人在线运行中~"

    # 时间
    if content in ("/time", "/时间", "几点了"):
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return f"🕐 当前时间：{now}"

    # 笑话
    if content in ("/joke", "/笑话", "讲个笑话"):
        jokes = [
            "😄 程序员最讨厌的数字是什么？1024，因为它总让人加班。",
            "🤣 为什么程序员喜欢黑色？因为黑色不反光，能看到屏幕上的 bug。",
            "😆 一个 SQL 查询走进酒吧，看到两张表，问：我可以 JOIN 你们吗？",
            "😂 程序员的老婆让他去买菜，说：买一斤包子，如果看到卖西瓜的，买一个。结果他买了一个包子回来。"
        ]
        import random
        return random.choice(jokes)

    # 关于
    if content in ("/about", "/关于"):
        return """🤖 君灵AI v1.0
基于 JunjunChat Bot API 开发
功能：自动回复、命令处理、群聊管理
作者：JunjunChat 团队"""

    # 天气（示例，需要真实API可自行扩展）
    if content.startswith("/天气") or content.startswith("/weather"):
        city = content.replace("/天气", "").replace("/weather", "").strip() or "未知"
        return f"🌤️ {city}天气：晴，25°C，微风（示例数据，接入真实API后可显示真实天气）"

    return None


def auto_reply(content, sender_name):
    """智能回复（非命令）"""
    content = content.lower()

    if any(k in content for k in ["你好", "hello", "hi", "嗨", "在吗", "在不在"]):
        return f"你好呀 {sender_name}！我是君灵AI，有什么可以帮你的？输入 /help 查看命令~"

    if any(k in content for k in ["谢谢", "感谢", "thanks", "thank"]):
        return "不客气！能帮到你我很开心~ 😊"

    if any(k in content for k in ["再见", "拜拜", "bye", "88"]):
        return "再见啦！随时找我聊天~ 👋"

    if any(k in content for k in ["你是谁", "你叫什么", "你是"]):
        return "我是君灵AI，一个基于 JunjunChat 的智能机器人！输入 /help 了解我能做什么~"

    if any(k in content for k in ["天气", "下雨", "冷不冷", "热不热"]):
        return "想查天气？输入 /天气 城市名，比如 /天气 北京"

    if "?" in content or "？" in content:
        return f"这是个好问题！不过我目前还在学习中，你可以试试输入 /help 看看我会什么~"

    # 默认回复
    import random
    replies = [
        f"收到 {sender_name} 的消息：「{content[:30]}」我正在思考... 🤔",
        "嗯嗯，我听到了！还有什么想说的吗？",
        "有意思！多和我说说~",
        "我记下来了！输入 /help 可以看我会的命令哦~",
        "好的好的，没问题！😄"
    ]
    return random.choice(replies)


async def listen():
    """WebSocket 监听消息"""
    global connected, bot_info
    print(f"🤖 君灵AI 正在连接...")
    print(f"🔗 WebSocket: {WS_URL}")

    async for websocket in websockets.connect(WS_URL):
        try:
            connected = True
            print("✅ 机器人已上线！等待消息...")

            # 心跳
            async def heartbeat():
                while True:
                    await asyncio.sleep(25)
                    try:
                        await websocket.send("ping")
                    except:
                        break

            asyncio.create_task(heartbeat())

            # 接收消息
            async for message in websocket:
                if message == "pong":
                    continue

                try:
                    data = json.loads(message)
                    if data.get("type") == "message.created":
                        msg = data["data"]
                        sender = msg.get("sender", {})
                        sender_name = sender.get("nickname") or sender.get("username") or "用户"
                        sender_id = msg.get("sender_id")
                        conv_id = msg.get("conversation_id")
                        content = msg.get("content", "")

                        print(f"📨 [{sender_name}] {content}")

                        # 不回复自己
                        if sender_name == "君灵AI":
                            continue

                        # 判断是否@机器人
                        is_mention = "@君灵AI" in content or "@bot" in content.lower()

                        # 处理命令
                        if content.startswith("/"):
                            reply = handle_command(content, sender_name, conv_id)
                            if reply:
                                send_message(conv_id, reply)
                                print(f"↩️ [命令回复] {reply[:50]}")
                                continue

                        # @机器人 或 群聊中被@
                        if is_mention:
                            clean_content = content.replace("@君灵AI", "").replace("@bot", "").strip()
                            reply = auto_reply(clean_content or "你好", sender_name)
                            send_message(conv_id, f"@{sender_name} {reply}")
                            print(f"↩️ [@回复] {reply[:50]}")
                            continue

                        # 私聊自动回复
                        # （群聊中不@不回复，避免刷屏）
                        # 如果需要群聊也自动回复，取消下面注释：
                        # reply = auto_reply(content, sender_name)
                        # send_message(conv_id, reply)

                except json.JSONDecodeError:
                    pass
                except Exception as e:
                    print(f"[处理消息错误] {e}")

        except websockets.ConnectionClosed:
            connected = False
            print("⚠️ 连接断开，5秒后重连...")
            await asyncio.sleep(5)
        except Exception as e:
            connected = False
            print(f"❌ 连接错误: {e}")
            await asyncio.sleep(5)


if __name__ == "__main__":
    # 先获取机器人信息
    try:
        bot_info = api_request("GET", "/bot-api/me")
        if bot_info:
            print(f"🤖 机器人信息: {bot_info}")
    except:
        pass

    print("=" * 50)
    print("  君灵AI 机器人启动中...")
    print("  命令: /help, /ping, /时间, /笑话, /关于")
    print("  群聊中 @君灵AI + 内容 即可对话")
    print("=" * 50)

    asyncio.run(listen())
