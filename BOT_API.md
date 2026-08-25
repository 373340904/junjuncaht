# JunjunChat Bot API 文档

## 概述

JunjunChat Bot API 允许开发者创建自动化机器人，实现消息接收、自动回复、群管理等功能。API 设计参考 KukeChat / KOOK 风格。

## 鉴权

所有 Bot API 请求需要在 HTTP Header 中携带 Bot Key：

```
Authorization: Bot <your_bot_key>
```

## WebSocket 实时消息

### 连接地址

```
wss://your-domain/bot/ws?key=<your_bot_key>
```

### 心跳

连接后每 25 秒发送 `ping`，服务端回复 `pong`。

### 接收消息

连接建立后，服务端会推送以下事件：

```json
{
  "type": "message.created",
  "data": {
    "id": 1,
    "conversation_id": 1,
    "sender_id": 2,
    "content": "你好",
    "message_type": "text",
    "created_at": "2026-08-25T10:00:00",
    "sender": {
      "id": 2,
      "username": "user1",
      "nickname": "用户1",
      "is_bot": false
    }
  }
}
```

## REST API

### 获取机器人信息

```
GET /bot-api/me
```

响应：
```json
{
  "bot": {"id": 1, "name": "我的机器人", "bot_key": "xxx", "is_online": true},
  "user_id": 1000001
}
```

### 获取会话信息

```
GET /bot-api/conversations/{id}
```

响应：
```json
{
  "id": 1,
  "type": "group",
  "title": "群聊名称",
  "owner_id": 1,
  "announcement": "群公告",
  "member_count": 10,
  "is_official": false,
  "created_at": "2026-08-25T10:00:00"
}
```

### 获取群成员列表

```
GET /bot-api/conversations/{id}/members
```

### 获取历史消息

```
GET /bot-api/conversations/{id}/messages?limit=50
```

### 发送消息到群聊/会话

```
POST /bot-api/conversations/{id}/messages
Content-Type: application/json
Authorization: Bot <key>

{"message": "你好世界"}
```

### 发送私信给用户

```
POST /bot-api/users/{user_id}/messages
Content-Type: application/json
Authorization: Bot <key>

{"message": "你好"}
```

## Python SDK 示例

```python
import asyncio
import json
import websockets
import requests

BOT_KEY = "your_bot_key"
API_BASE = "https://your-domain"

async def bot_main():
    uri = f"wss://your-domain/bot/ws?key={BOT_KEY}"
    async with websockets.connect(uri) as ws:
        print("Bot connected!")
        async for message in ws:
            if message == "pong":
                continue
            data = json.loads(message)
            if data["type"] == "message.created":
                msg = data["data"]
                conv_id = msg["conversation_id"]
                content = msg["content"]
                sender = msg["sender"]["nickname"]

                # 自动回复
                reply = f"收到 {sender} 的消息: {content}"
                requests.post(
                    f"{API_BASE}/bot-api/conversations/{conv_id}/messages",
                    headers={"Authorization": f"Bot {BOT_KEY}"},
                    json={"message": reply},
                    verify=False
                )

asyncio.run(bot_main())
```

## JavaScript SDK 示例

```javascript
const BOT_KEY = "your_bot_key";
const API_BASE = "https://your-domain";

const ws = new WebSocket(`wss://your-domain/bot/ws?key=${BOT_KEY}`);

ws.onopen = () => console.log("Bot connected!");

ws.onmessage = async (evt) => {
  if (evt.data === "pong") return;
  const msg = JSON.parse(evt.data);
  if (msg.type === "message.created") {
    const data = msg.data;
    const convId = data.conversation_id;
    const reply = `收到: ${data.content}`;

    await fetch(`${API_BASE}/bot-api/conversations/${convId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bot ${BOT_KEY}`
      },
      body: JSON.stringify({ message: reply })
    });
  }
};

// 心跳
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) ws.send("ping");
}, 25000);
```

## 常见问题

**Q: 机器人如何加入群聊？**
A: 机器人创建后会自动获得一个虚拟用户ID（bot.id + 1000000），群主可以像添加普通用户一样将机器人添加到群聊。

**Q: 如何判断消息是否@了机器人？**
A: 检查消息内容中是否包含 `@机器人名称`。

**Q: 支持哪些消息类型？**
A: 目前支持 text 文本消息，表情包以 emoji 字符形式发送。
