"""
JunjunChat Server - 独立聊天服务端
FastAPI + SQLite + WebSocket
部署: Render (Docker)
"""
import os
import json
import time
import uuid
import secrets
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Header, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, select, update, delete, func
from passlib.context import CryptContext
from jose import jwt, JWTError

# ========== 配置 ==========
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", secrets.token_urlsafe(64))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./junjunchat.db")
# Railway PostgreSQL 自动提供 postgresql://，需要转成异步驱动格式
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "225878")
OFFICIAL_GROUP_TITLE = "JunjunChat 官方群"

# 确保数据目录存在
if "sqlite" in DATABASE_URL:
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    if db_path and "/" in db_path:
        os.makedirs(os.path.dirname(db_path), exist_ok=True)

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ========== 数据模型 ==========
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    nickname = Column(String(100), default="")
    hashed_password = Column(String(200), nullable=False)
    avatar = Column(String(10), default="")
    status = Column(String(20), default="offline")  # online/away/busy/offline
    signature = Column(String(200), default="")  # 个性签名
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class FriendRequest(Base):
    __tablename__ = "friend_requests"
    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending/accepted/rejected
    created_at = Column(DateTime, default=datetime.utcnow)

class Friendship(Base):
    __tablename__ = "friendships"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    friend_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True)
    type = Column(String(20), default="direct")  # direct/group
    title = Column(String(200), default="")
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    announcement = Column(Text, default="")  # 群公告
    is_official = Column(Boolean, default=False)  # 官方群
    created_at = Column(DateTime, default=datetime.utcnow)

class ConversationMember(Base):
    __tablename__ = "conversation_members"
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default="member")  # owner/admin/member
    muted_until = Column(DateTime, nullable=True)  # 禁言截止
    joined_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, default="")
    message_type = Column(String(20), default="text")
    is_deleted = Column(Boolean, default=False)  # 撤回
    created_at = Column(DateTime, default=datetime.utcnow)

class Bot(Base):
    __tablename__ = "bots"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    bot_key = Column(String(100), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_online = Column(Boolean, default=False)
    is_public = Column(Boolean, default=True)
    avatar_url = Column(String(500), default="")
    category = Column(String(50), default="general")
    install_count = Column(Integer, default=0)
    rating = Column(Float, default=0)
    review_count = Column(Integer, default=0)
    last_seen = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, default="")
    images = Column(Text, default="")  # JSON array
    likes_count = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PostLike(Base):
    __tablename__ = "post_likes"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PostComment(Base):
    __tablename__ = "post_comments"
    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="pending")  # pending/in_progress/done
    priority = Column(String(20), default="normal")  # low/normal/high
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Announcement(Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), default="")
    content = Column(Text, default="")
    is_global = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Bookmark(Base):
    __tablename__ = "bookmarks"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class BotInstallation(Base):
    __tablename__ = "bot_installations"
    id = Column(Integer, primary_key=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    installed_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    enabled = Column(Boolean, default=True)
    receive_messages = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class BotReview(Base):
    __tablename__ = "bot_reviews"
    id = Column(Integer, primary_key=True)
    bot_id = Column(Integer, ForeignKey("bots.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, default=5)
    content = Column(Text, default="")
    likes_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    reason = Column(String(500), default="")
    status = Column(String(20), default="pending")  # pending/resolved/rejected
    created_at = Column(DateTime, default=datetime.utcnow)

# ========== WebSocket 连接管理 ==========
class ConnectionManager:
    def __init__(self):
        self.user_connections: Dict[int, WebSocket] = {}
        self.bot_connections: Dict[str, WebSocket] = {}
        self.user_bot_map: Dict[int, str] = {}  # bot_user_id -> bot_key

    async def connect_user(self, user_id: int, ws: WebSocket):
        await ws.accept()
        self.user_connections[user_id] = ws

    def disconnect_user(self, user_id: int):
        self.user_connections.pop(user_id, None)

    async def connect_bot(self, bot_key: str, ws: WebSocket, bot_user_id: int):
        await ws.accept()
        self.bot_connections[bot_key] = ws
        self.user_bot_map[bot_user_id] = bot_key

    def disconnect_bot(self, bot_key: str):
        self.bot_connections.pop(bot_key, None)
        for uid, key in list(self.user_bot_map.items()):
            if key == bot_key:
                del self.user_bot_map[uid]

    async def send_to_user(self, user_id: int, data: dict):
        ws = self.user_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
                return True
            except:
                self.disconnect_user(user_id)
        return False

    async def send_to_bot(self, bot_key: str, data: dict):
        ws = self.bot_connections.get(bot_key)
        if ws:
            try:
                await ws.send_json(data)
                return True
            except:
                self.disconnect_bot(bot_key)
        return False

    async def broadcast_to_conversation(self, conv_id: int, data: dict, exclude_id: int = None):
        async with async_session() as session:
            result = await session.execute(
                select(ConversationMember.user_id).where(ConversationMember.conversation_id == conv_id)
            )
            member_ids = [row[0] for row in result.fetchall()]
        for uid in member_ids:
            if uid != exclude_id:
                await self.send_to_user(uid, data)
        # 检查是否有机器人在群里
        for uid in member_ids:
            bot_key = self.user_bot_map.get(uid)
            if bot_key and uid != exclude_id:
                await self.send_to_bot(bot_key, data)

manager = ConnectionManager()

# ========== 工具函数 ==========
def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def user_to_dict(u: User):
    return {
        "id": u.id, "username": u.username, "nickname": u.nickname or u.username,
        "avatar": u.avatar, "status": u.status, "signature": u.signature or "",
        "is_admin": u.is_admin,
        "created_at": u.created_at.isoformat() if u.created_at else None
    }

def bot_to_dict(b: Bot):
    return {
        "id": b.id, "name": b.name, "description": b.description,
        "bot_key": b.bot_key, "owner_id": b.owner_id, "is_online": b.is_online,
        "is_public": b.is_public if hasattr(b, 'is_public') else True,
        "avatar_url": b.avatar_url if hasattr(b, 'avatar_url') else "",
        "category": b.category if hasattr(b, 'category') else "general",
        "install_count": b.install_count if hasattr(b, 'install_count') else 0,
        "rating": b.rating if hasattr(b, 'rating') else 0,
        "review_count": b.review_count if hasattr(b, 'review_count') else 0,
        "last_seen": b.last_seen.isoformat() if b.last_seen else None,
        "user_id": b.id + 1000000,  # 机器人虚拟用户ID
        "created_at": b.created_at.isoformat() if b.created_at else None
    }

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

async def get_bot_from_key(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bot "):
        raise HTTPException(status_code=401, detail="Bot key required")
    key = authorization.split(" ", 1)[1]
    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.bot_key == key))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(status_code=401, detail="Invalid bot key")
        return bot

# ========== Pydantic 模型 ==========
class RegisterReq(BaseModel):
    username: str
    password: str
    nickname: Optional[str] = ""

class LoginReq(BaseModel):
    username_or_email: str
    password: str
    remember_me: Optional[bool] = True

class SendMsgReq(BaseModel):
    content: str
    message_type: Optional[str] = "text"

class CreateGroupReq(BaseModel):
    title: str
    member_ids: Optional[List[int]] = []

class CreateDirectReq(BaseModel):
    user_id: int

class FriendReq(BaseModel):
    receiver_id: int

class CreateBotReq(BaseModel):
    name: str
    description: Optional[str] = ""
    is_public: Optional[bool] = False

class BotSendMsgReq(BaseModel):
    message: str

# ========== 应用初始化 ==========
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # 初始化官方群
    async with async_session() as session:
        result = await session.execute(select(Conversation).where(Conversation.is_official == True))
        if not result.scalar_one_or_none():
            official = Conversation(
                type="group", title=OFFICIAL_GROUP_TITLE,
                owner_id=None, is_official=True,
                announcement="欢迎来到 JunjunChat 官方群！这里是大家交流的地方。"
            )
            session.add(official)
            await session.commit()
    yield

app = FastAPI(title="JunjunChat API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ========== 健康检查 ==========
@app.get("/health")
async def health():
    return {"status": "ok"}

# ========== 认证 ==========
@app.post("/api/v1/auth/register")
async def register(req: RegisterReq):
    username = req.username.strip().lower()
    if len(username) < 3 or len(username) > 50:
        raise HTTPException(400, "用户名长度3-50")
    if len(req.password) < 6:
        raise HTTPException(400, "密码至少6位")
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none():
            raise HTTPException(400, "用户名已被占用")
        user = User(
            username=username,
            nickname=req.nickname or username,
            hashed_password=get_password_hash(req.password),
            avatar=username[0].upper() if username else "?",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        # 自动加入官方群
        result = await session.execute(select(Conversation).where(Conversation.is_official == True))
        official = result.scalar_one_or_none()
        if official:
            member = ConversationMember(conversation_id=official.id, user_id=user.id, role="member")
            session.add(member)
            await session.commit()
        token = create_access_token({"sub": str(user.id)})
        return {"access_token": token, "token_type": "bearer", "user": user_to_dict(user)}

@app.post("/api/v1/auth/login")
async def login(req: LoginReq):
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.username == req.username_or_email.strip().lower())
        )
        user = result.scalar_one_or_none()
        if not user or not verify_password(req.password, user.hashed_password):
            raise HTTPException(401, "用户名或密码错误")
        token = create_access_token({"sub": str(user.id)})
        return {"access_token": token, "token_type": "bearer", "user": user_to_dict(user)}

@app.get("/api/v1/auth/me")
async def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)

class ProfileReq(BaseModel):
    nickname: str = ""
    signature: str = ""

@app.put("/api/v1/auth/profile")
async def update_profile(req: ProfileReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        u = await session.get(User, user.id)
        if req.nickname: u.nickname = req.nickname[:100]
        if req.signature is not None: u.signature = req.signature[:200]
        await session.commit()
        await session.refresh(u)
        return user_to_dict(u)

class StatusReq(BaseModel):
    status: str = "online"

@app.put("/api/v1/auth/status")
async def update_status(req: StatusReq, user: User = Depends(get_current_user)):
    if req.status not in ("online","away","busy","offline"):
        raise HTTPException(400, "无效状态")
    async with async_session() as session:
        u = await session.get(User, user.id)
        u.status = req.status
        await session.commit()
        return {"status": "ok"}

# ========== 用户 ==========
@app.get("/api/v1/users/search")
async def search_users(q: str, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(User).where(
                (User.username.contains(q.lower())) | (User.nickname.contains(q))
            ).limit(20)
        )
        users = result.scalars().all()
        return [user_to_dict(u) for u in users if u.id != user.id]

@app.get("/api/v1/users/{user_id}")
async def get_user(user_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        u = result.scalar_one_or_none()
        if not u:
            raise HTTPException(404, "用户不存在")
        return user_to_dict(u)

# ========== 好友 ==========
@app.get("/api/v1/friends")
async def list_friends(user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Friendship.friend_id).where(Friendship.user_id == user.id)
        )
        friend_ids = [row[0] for row in result.fetchall()]
        if not friend_ids:
            return []
        result = await session.execute(select(User).where(User.id.in_(friend_ids)))
        friends = result.scalars().all()
        return [user_to_dict(f) for f in friends]

@app.post("/api/v1/friends/requests")
async def send_friend_request(req: FriendReq, user: User = Depends(get_current_user)):
    if req.receiver_id == user.id:
        raise HTTPException(400, "不能加自己为好友")
    async with async_session() as session:
        # 检查是否已经是好友
        result = await session.execute(
            select(Friendship).where(
                (Friendship.user_id == user.id) & (Friendship.friend_id == req.receiver_id)
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(400, "已经是好友了")
        # 检查是否已有待处理请求
        result = await session.execute(
            select(FriendRequest).where(
                (FriendRequest.sender_id == user.id) &
                (FriendRequest.receiver_id == req.receiver_id) &
                (FriendRequest.status == "pending")
            )
        )
        if result.scalar_one_or_none():
            raise HTTPException(400, "已发送过好友请求")
        fr = FriendRequest(sender_id=user.id, receiver_id=req.receiver_id)
        session.add(fr)
        await session.commit()
        return {"id": fr.id, "status": "pending"}

@app.get("/api/v1/friends/requests/incoming")
async def incoming_requests(user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(FriendRequest).where(
                (FriendRequest.receiver_id == user.id) & (FriendRequest.status == "pending")
            ).order_by(FriendRequest.created_at.desc())
        )
        reqs = result.scalars().all()
        output = []
        for r in reqs:
            result2 = await session.execute(select(User).where(User.id == r.sender_id))
            sender = result2.scalar_one_or_none()
            output.append({
                "id": r.id, "sender": user_to_dict(sender) if sender else None,
                "status": r.status, "created_at": r.created_at.isoformat()
            })
        return output

@app.post("/api/v1/friends/requests/{request_id}/accept")
async def accept_request(request_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(FriendRequest).where(
                (FriendRequest.id == request_id) & (FriendRequest.receiver_id == user.id)
            )
        )
        fr = result.scalar_one_or_none()
        if not fr:
            raise HTTPException(404, "请求不存在")
        fr.status = "accepted"
        # 双向好友
        session.add(Friendship(user_id=fr.sender_id, friend_id=user.id))
        session.add(Friendship(user_id=user.id, friend_id=fr.sender_id))
        await session.commit()
        return {"status": "accepted"}

@app.post("/api/v1/friends/requests/{request_id}/reject")
async def reject_request(request_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(FriendRequest).where(
                (FriendRequest.id == request_id) & (FriendRequest.receiver_id == user.id)
            )
        )
        fr = result.scalar_one_or_none()
        if not fr:
            raise HTTPException(404, "请求不存在")
        fr.status = "rejected"
        await session.commit()
        return {"status": "rejected"}

@app.delete("/api/v1/friends/{friend_id}")
async def delete_friend(friend_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        await session.execute(
            delete(Friendship).where(
                ((Friendship.user_id == user.id) & (Friendship.friend_id == friend_id)) |
                ((Friendship.user_id == friend_id) & (Friendship.friend_id == user.id))
            )
        )
        await session.commit()
        return {"status": "deleted"}

# ========== 会话 ==========
@app.get("/api/v1/conversations")
async def list_conversations(user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Conversation).join(
                ConversationMember,
                ConversationMember.conversation_id == Conversation.id
            ).where(ConversationMember.user_id == user.id).order_by(Conversation.created_at.desc())
        )
        convs = result.scalars().all()
        output = []
        for c in convs:
            # 最后一条消息
            msg_result = await session.execute(
                select(Message).where(Message.conversation_id == c.id).order_by(Message.id.desc()).limit(1)
            )
            last_msg = msg_result.scalar_one_or_none()
            # 群成员数
            count_result = await session.execute(
                select(func.count(ConversationMember.id)).where(ConversationMember.conversation_id == c.id)
            )
            member_count = count_result.scalar() or 0
            # 私聊标题
            title = c.title
            if c.type == "direct":
                member_result = await session.execute(
                    select(ConversationMember.user_id).where(ConversationMember.conversation_id == c.id)
                )
                member_ids = [row[0] for row in member_result.fetchall()]
                other_id = next((uid for uid in member_ids if uid != user.id), user.id)
                user_result = await session.execute(select(User).where(User.id == other_id))
                other = user_result.scalar_one_or_none()
                title = other.nickname if other else "未知用户"
            output.append({
                "id": c.id, "type": c.type, "title": title,
                "owner_id": c.owner_id, "member_count": member_count,
                "last_message": {
                    "content": last_msg.content if last_msg else "",
                    "sender_id": last_msg.sender_id if last_msg else None,
                    "created_at": last_msg.created_at.isoformat() if last_msg else None
                } if last_msg else None,
                "created_at": c.created_at.isoformat()
            })
        return output

@app.post("/api/v1/conversations/direct")
async def create_direct(req: CreateDirectReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        # 检查是否已有私聊
        result = await session.execute(
            select(Conversation.id).join(
                ConversationMember, ConversationMember.conversation_id == Conversation.id
            ).where(
                (Conversation.type == "direct") &
                (ConversationMember.user_id == user.id)
            )
        )
        conv_ids = [row[0] for row in result.fetchall()]
        for cid in conv_ids:
            member_result = await session.execute(
                select(ConversationMember.user_id).where(ConversationMember.conversation_id == cid)
            )
            members = [row[0] for row in member_result.fetchall()]
            if req.user_id in members and len(members) == 2:
                return {"id": cid, "type": "direct"}
        # 创建新私聊
        conv = Conversation(type="direct", title="")
        session.add(conv)
        await session.flush()
        session.add(ConversationMember(conversation_id=conv.id, user_id=user.id))
        session.add(ConversationMember(conversation_id=conv.id, user_id=req.user_id))
        await session.commit()
        await session.refresh(conv)
        return {"id": conv.id, "type": "direct"}

@app.post("/api/v1/conversations/groups")
async def create_group(req: CreateGroupReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = Conversation(type="group", title=req.title, owner_id=user.id)
        session.add(conv)
        await session.flush()
        session.add(ConversationMember(conversation_id=conv.id, user_id=user.id))
        for mid in req.member_ids:
            session.add(ConversationMember(conversation_id=conv.id, user_id=mid))
        await session.commit()
        await session.refresh(conv)
        return {"id": conv.id, "type": "group", "title": conv.title}

@app.post("/api/v1/conversations/{conversation_id}/join")
async def join_group(conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Conversation).where(
                (Conversation.id == conversation_id) & (Conversation.type == "group")
            )
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(404, "群聊不存在")
        # 检查是否已加入
        member_result = await session.execute(
            select(ConversationMember).where(
                (ConversationMember.conversation_id == conversation_id) &
                (ConversationMember.user_id == user.id)
            )
        )
        if member_result.scalar_one_or_none():
            return {"status": "already_joined"}
        session.add(ConversationMember(conversation_id=conversation_id, user_id=user.id))
        await session.commit()
        return {"status": "joined", "conversation_id": conversation_id}

@app.get("/api/v1/conversations/{conversation_id}/members")
async def list_members(conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id)
        )
        member_ids = [row[0] for row in result.fetchall()]
        if not member_ids:
            return []
        result = await session.execute(select(User).where(User.id.in_(member_ids)))
        users = result.scalars().all()
        return [user_to_dict(u) for u in users]

# ========== 群管理 ==========
async def get_member_role(session, conversation_id, user_id):
    result = await session.execute(
        select(ConversationMember).where(
            (ConversationMember.conversation_id == conversation_id) &
            (ConversationMember.user_id == user_id)
        )
    )
    return result.scalar_one_or_none()

@app.get("/api/v1/conversations/{conversation_id}")
async def get_conversation(conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, conversation_id)
        if not conv:
            raise HTTPException(404, "会话不存在")
        # 成员列表（含角色）
        result = await session.execute(
            select(ConversationMember, User).join(User, ConversationMember.user_id == User.id)
            .where(ConversationMember.conversation_id == conversation_id)
        )
        members = []
        for member, u in result.fetchall():
            d = user_to_dict(u)
            d["role"] = member.role
            d["muted_until"] = member.muted_until.isoformat() if member.muted_until else None
            d["joined_at"] = member.joined_at.isoformat() if member.joined_at else None
            members.append(d)
        return {
            "id": conv.id, "type": conv.type, "title": conv.title,
            "owner_id": conv.owner_id, "announcement": conv.announcement or "",
            "is_official": conv.is_official, "member_count": len(members),
            "members": members, "created_at": conv.created_at.isoformat() if conv.created_at else None
        }

class GroupUpdateReq(BaseModel):
    title: str = None
    announcement: str = None

@app.put("/api/v1/conversations/{conversation_id}")
async def update_group(conversation_id: int, req: GroupUpdateReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, conversation_id)
        if not conv or conv.type != "group":
            raise HTTPException(404, "群聊不存在")
        member = await get_member_role(session, conversation_id, user.id)
        if not member:
            raise HTTPException(403, "不是群成员")
        if member.role != "owner" and member.role != "admin":
            raise HTTPException(403, "无权限")
        if req.title is not None and member.role == "owner":
            conv.title = req.title[:100]
        if req.announcement is not None:
            conv.announcement = req.announcement[:500]
        await session.commit()
        return {"status": "ok"}

class RoleReq(BaseModel):
    user_id: int
    role: str  # admin/member

@app.post("/api/v1/conversations/{conversation_id}/role")
async def set_member_role(conversation_id: int, req: RoleReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, conversation_id, user.id)
        if not member or member.role != "owner":
            raise HTTPException(403, "只有群主可以设置管理员")
        target = await get_member_role(session, conversation_id, req.user_id)
        if not target:
            raise HTTPException(404, "用户不在群内")
        if req.role not in ("admin", "member"):
            raise HTTPException(400, "无效角色")
        target.role = req.role
        await session.commit()
        return {"status": "ok"}

class MuteReq(BaseModel):
    user_id: int
    duration_minutes: int = 0  # 0=解除禁言

@app.post("/api/v1/conversations/{conversation_id}/mute")
async def mute_member(conversation_id: int, req: MuteReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, conversation_id, user.id)
        if not member or member.role not in ("owner", "admin"):
            raise HTTPException(403, "无权限")
        target = await get_member_role(session, conversation_id, req.user_id)
        if not target:
            raise HTTPException(404, "用户不在群内")
        if target.role == "owner":
            raise HTTPException(403, "不能禁言群主")
        if req.duration_minutes <= 0:
            target.muted_until = None
        else:
            target.muted_until = datetime.utcnow() + timedelta(minutes=req.duration_minutes)
        await session.commit()
        return {"status": "ok", "muted_until": target.muted_until.isoformat() if target.muted_until else None}

@app.post("/api/v1/conversations/{conversation_id}/kick")
async def kick_member(conversation_id: int, req: RoleReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, conversation_id, user.id)
        if not member or member.role not in ("owner", "admin"):
            raise HTTPException(403, "无权限")
        target = await get_member_role(session, conversation_id, req.user_id)
        if not target:
            raise HTTPException(404, "用户不在群内")
        if target.role == "owner":
            raise HTTPException(403, "不能踢群主")
        await session.delete(target)
        await session.commit()
        return {"status": "ok"}

@app.post("/api/v1/conversations/{conversation_id}/leave")
async def leave_group(conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, conversation_id)
        if not conv or conv.type != "group":
            raise HTTPException(404, "群聊不存在")
        if conv.owner_id == user.id:
            raise HTTPException(400, "群主不能退出，请先转让或解散")
        member = await get_member_role(session, conversation_id, user.id)
        if not member:
            raise HTTPException(403, "不是群成员")
        await session.delete(member)
        await session.commit()
        return {"status": "ok"}

@app.delete("/api/v1/conversations/{conversation_id}")
async def delete_group(conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, conversation_id)
        if not conv or conv.type != "group":
            raise HTTPException(404, "群聊不存在")
        if conv.owner_id != user.id:
            raise HTTPException(403, "只有群主可以解散")
        # 删除成员和消息
        await session.execute(delete(ConversationMember).where(ConversationMember.conversation_id == conversation_id))
        await session.execute(delete(Message).where(Message.conversation_id == conversation_id))
        await session.delete(conv)
        await session.commit()
        return {"status": "deleted"}

# ========== 用户名片 ==========
@app.get("/api/v1/users/{user_id}/profile")
async def user_profile(user_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        u = await session.get(User, user_id)
        if not u:
            raise HTTPException(404, "用户不存在")
        # 是否是好友
        friend_result = await session.execute(
            select(Friendship).where(
                ((Friendship.user_id == user.id) & (Friendship.friend_id == user_id)) |
                ((Friendship.user_id == user_id) & (Friendship.friend_id == user.id))
            )
        )
        is_friend = friend_result.scalar_one_or_none() is not None
        d = user_to_dict(u)
        d["is_friend"] = is_friend
        return d

class AvatarReq(BaseModel):
    avatar: str  # emoji 或 颜色

@app.put("/api/v1/auth/avatar")
async def update_avatar(req: AvatarReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        u = await session.get(User, user.id)
        u.avatar = req.avatar[:10]
        await session.commit()
        return {"status": "ok", "avatar": u.avatar}

# ========== 举报 ==========
class ReportReq(BaseModel):
    target_user_id: int
    conversation_id: int = None
    reason: str = ""

@app.post("/api/v1/reports")
async def create_report(req: ReportReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        report = Report(
            reporter_id=user.id, target_user_id=req.target_user_id,
            conversation_id=req.conversation_id, reason=req.reason[:500]
        )
        session.add(report)
        await session.commit()
        # 通知管理员（君衔，ID=junjun）
        # 这里简化处理，记录到数据库
        return {"status": "reported", "report_id": report.id}

# ========== 消息 ==========
@app.get("/api/v1/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: int, limit: int = 50, user: User = Depends(get_current_user)):
    async with async_session() as session:
        # 检查是否是成员
        member_result = await session.execute(
            select(ConversationMember).where(
                (ConversationMember.conversation_id == conversation_id) &
                (ConversationMember.user_id == user.id)
            )
        )
        if not member_result.scalar_one_or_none():
            raise HTTPException(403, "不是该会话成员")
        result = await session.execute(
            select(Message).where(Message.conversation_id == conversation_id)
            .order_by(Message.id.desc()).limit(limit)
        )
        msgs = list(reversed(result.scalars().all()))
        output = []
        for m in msgs:
            sender_result = await session.execute(select(User).where(User.id == m.sender_id))
            sender = sender_result.scalar_one_or_none()
            output.append({
                "id": m.id, "conversation_id": m.conversation_id,
                "sender_id": m.sender_id, "sender": user_to_dict(sender) if sender else None,
                "content": m.content, "message_type": m.message_type,
                "created_at": m.created_at.isoformat()
            })
        return output

@app.post("/api/v1/conversations/{conversation_id}/messages")
async def send_message(conversation_id: int, req: SendMsgReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        # 检查是否是成员
        member_result = await session.execute(
            select(ConversationMember).where(
                (ConversationMember.conversation_id == conversation_id) &
                (ConversationMember.user_id == user.id)
            )
        )
        if not member_result.scalar_one_or_none():
            raise HTTPException(403, "不是该会话成员")
        msg = Message(
            conversation_id=conversation_id, sender_id=user.id,
            content=req.content, message_type=req.message_type
        )
        session.add(msg)
        await session.commit()
        await session.refresh(msg)
        msg_data = {
            "id": msg.id, "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id, "sender": user_to_dict(user),
            "content": msg.content, "message_type": msg.message_type,
            "created_at": msg.created_at.isoformat()
        }
        # 广播
        await manager.broadcast_to_conversation(conversation_id, {
            "type": "message.created", "data": msg_data
        }, exclude_id=user.id)
        return msg_data

# ========== 撤回消息 ==========
@app.delete("/api/v1/messages/{message_id}")
async def delete_message(message_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(Message).where(Message.id == message_id))
        msg = result.scalar_one_or_none()
        if not msg:
            raise HTTPException(404, "消息不存在")
        if msg.sender_id != user.id:
            raise HTTPException(403, "只能撤回自己的消息")
        # 2分钟内可撤回
        if (datetime.utcnow() - msg.created_at).total_seconds() > 120:
            raise HTTPException(400, "超过2分钟无法撤回")
        msg.is_deleted = True
        msg.content = "[消息已撤回]"
        await session.commit()
        msg_data = {
            "id": msg.id, "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id, "content": msg.content,
            "message_type": msg.message_type, "is_deleted": True,
            "created_at": msg.created_at.isoformat()
        }
        await manager.broadcast_to_conversation(msg.conversation_id, {
            "type": "message.deleted", "data": msg_data
        })
        return {"success": True}

# ========== 修改个人资料 ==========
class UpdateProfileReq(BaseModel):
    nickname: Optional[str] = None
    signature: Optional[str] = None

@app.put("/api/v1/users/me/profile")
async def update_profile(req: UpdateProfileReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        u = result.scalar_one_or_none()
        if not u:
            raise HTTPException(404, "用户不存在")
        if req.nickname is not None:
            u.nickname = req.nickname
        if req.signature is not None:
            u.signature = req.signature[:200]
        await session.commit()
        return user_to_dict(u)

# ========== 机器人 ==========
@app.get("/api/v1/bots/mine")
async def list_my_bots(user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Bot).where(Bot.owner_id == user.id).order_by(Bot.id.desc())
        )
        bots = result.scalars().all()
        return [bot_to_dict(b) for b in bots]

@app.post("/api/v1/bots")
async def create_bot(req: CreateBotReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        bot = Bot(
            name=req.name, description=req.description,
            bot_key="jj_" + secrets.token_urlsafe(24),
            owner_id=user.id
        )
        session.add(bot)
        await session.commit()
        await session.refresh(bot)
        # 自动加入官方群
        result = await session.execute(select(Conversation).where(Conversation.is_official == True))
        official = result.scalar_one_or_none()
        if official:
            bot_user_id = bot.id + 1000000
            session.add(ConversationMember(conversation_id=official.id, user_id=bot_user_id, role="member"))
            await session.commit()
        return bot_to_dict(bot)

@app.post("/api/v1/bots/{bot_id}/join/{conversation_id}")
async def bot_join_group(bot_id: int, conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(Bot).where((Bot.id == bot_id) & (Bot.owner_id == user.id)))
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "机器人不存在")
        result = await session.execute(select(Conversation).where(Conversation.id == conversation_id))
        conv = result.scalar_one_or_none()
        if not conv or conv.type != "group":
            raise HTTPException(404, "群聊不存在")
        bot_user_id = bot.id + 1000000
        result = await session.execute(select(ConversationMember).where(
            (ConversationMember.conversation_id == conversation_id) &
            (ConversationMember.user_id == bot_user_id)
        ))
        if result.scalar_one_or_none():
            return {"status": "already_joined"}
        session.add(ConversationMember(conversation_id=conversation_id, user_id=bot_user_id, role="member"))
        await session.commit()
        return {"status": "joined"}

@app.post("/api/v1/bots/{bot_id}/rotate-key")
async def rotate_bot_key(bot_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Bot).where((Bot.id == bot_id) & (Bot.owner_id == user.id))
        )
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "机器人不存在")
        bot.bot_key = "jj_" + secrets.token_urlsafe(24)
        await session.commit()
        await session.refresh(bot)
        return bot_to_dict(bot)

@app.delete("/api/v1/bots/{bot_id}")
async def delete_bot(bot_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Bot).where((Bot.id == bot_id) & (Bot.owner_id == user.id))
        )
        bot = result.scalar_one_or_none()
        if not bot:
            raise HTTPException(404, "机器人不存在")
        await session.execute(delete(Bot).where(Bot.id == bot_id))
        await session.commit()
        return {"status": "deleted"}

# ========== 机器人 API ==========
@app.get("/bot-api/me")
async def bot_me(bot: Bot = Depends(get_bot_from_key)):
    return {"bot": bot_to_dict(bot), "user_id": bot.id + 1000000}

@app.post("/bot-api/conversations/{conversation_id}/messages")
async def bot_send_message(conversation_id: int, req: BotSendMsgReq, bot: Bot = Depends(get_bot_from_key)):
    bot_user_id = bot.id + 1000000
    async with async_session() as session:
        msg = Message(
            conversation_id=conversation_id, sender_id=bot_user_id,
            content=req.message, message_type="text"
        )
        session.add(msg)
        await session.commit()
        await session.refresh(msg)
        msg_data = {
            "id": msg.id, "conversation_id": msg.conversation_id,
            "sender_id": bot_user_id,
            "sender": {"id": bot_user_id, "username": bot.name, "nickname": bot.name, "is_bot": True},
            "content": msg.content, "message_type": msg.message_type,
            "created_at": msg.created_at.isoformat()
        }
        await manager.broadcast_to_conversation(conversation_id, {
            "type": "message.created", "data": msg_data
        })
        return msg_data

@app.post("/bot-api/users/{user_id}/messages")
async def bot_send_dm(user_id: int, req: BotSendMsgReq, bot: Bot = Depends(get_bot_from_key)):
    bot_user_id = bot.id + 1000000
    async with async_session() as session:
        # 找或创建私聊
        result = await session.execute(
            select(Conversation.id).join(
                ConversationMember, ConversationMember.conversation_id == Conversation.id
            ).where(
                (Conversation.type == "direct") &
                (ConversationMember.user_id == bot_user_id)
            )
        )
        conv_ids = [row[0] for row in result.fetchall()]
        conv_id = None
        for cid in conv_ids:
            member_result = await session.execute(
                select(ConversationMember.user_id).where(ConversationMember.conversation_id == cid)
            )
            members = [row[0] for row in member_result.fetchall()]
            if user_id in members and len(members) == 2:
                conv_id = cid
                break
        if not conv_id:
            conv = Conversation(type="direct", title="")
            session.add(conv)
            await session.flush()
            session.add(ConversationMember(conversation_id=conv.id, user_id=bot_user_id))
            session.add(ConversationMember(conversation_id=conv.id, user_id=user_id))
            await session.commit()
            conv_id = conv.id
        msg = Message(
            conversation_id=conv_id, sender_id=bot_user_id,
            content=req.message, message_type="text"
        )
        session.add(msg)
        await session.commit()
        await session.refresh(msg)
        msg_data = {
            "id": msg.id, "conversation_id": conv_id,
            "sender_id": bot_user_id,
            "sender": {"id": bot_user_id, "username": bot.name, "nickname": bot.name, "is_bot": True},
            "content": msg.content, "message_type": msg.message_type,
            "created_at": msg.created_at.isoformat()
        }
        await manager.send_to_user(user_id, {"type": "message.created", "data": msg_data})
        return msg_data

# ========== WebSocket: 用户 ==========
@app.websocket("/ws")
async def user_ws(websocket: WebSocket, token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub"))
    except:
        await websocket.close(code=1008)
        return
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await websocket.close(code=1008)
            return
        user.status = "online"
        await session.commit()
    await manager.connect_user(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_user(user_id)
        async with async_session() as session:
            result = await session.execute(select(User).where(User.id == user_id))
            u = result.scalar_one_or_none()
            if u:
                u.status = "offline"
                await session.commit()

# ========== WebSocket: 机器人 ==========
@app.websocket("/bot/ws")
async def bot_ws(websocket: WebSocket, key: str):
    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.bot_key == key))
        bot = result.scalar_one_or_none()
        if not bot:
            await websocket.close(code=1008)
            return
        bot.is_online = True
        bot.last_seen = datetime.utcnow()
        await session.commit()
    bot_user_id = bot.id + 1000000
    await manager.connect_bot(key, websocket, bot_user_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect_bot(key)
        async with async_session() as session:
            result = await session.execute(select(Bot).where(Bot.bot_key == key))
            b = result.scalar_one_or_none()
            if b:
                b.is_online = False
                b.last_seen = datetime.utcnow()
                await session.commit()

# ========== 用户状态 ==========
class StatusReq(BaseModel):
    status: str  # online/away/busy/offline

@app.put("/api/v1/users/me/status")
async def update_status(req: StatusReq, user: User = Depends(get_current_user)):
    if req.status not in ["online", "away", "busy", "offline"]:
        raise HTTPException(400, "无效状态")
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user.id))
        u = result.scalar_one_or_none()
        if u:
            u.status = req.status
            await session.commit()
            return user_to_dict(u)
    raise HTTPException(404, "用户不存在")

# ========== 表情包 ==========
EMOJI_LIST = [
    {"id": "smile", "name": "微笑", "char": "😊"},
    {"id": "laugh", "name": "大笑", "char": "😂"},
    {"id": "love", "name": "爱心", "char": "❤️"},
    {"id": "cool", "name": "酷", "char": "😎"},
    {"id": "cry", "name": "哭", "char": "😭"},
    {"id": "angry", "name": "生气", "char": "😠"},
    {"id": "surprise", "name": "惊讶", "char": "😲"},
    {"id": "sleep", "name": "睡觉", "char": "😴"},
    {"id": "think", "name": "思考", "char": "🤔"},
    {"id": "ok", "name": "OK", "char": "👌"},
    {"id": "thumbsup", "name": "赞", "char": "👍"},
    {"id": "thumbsdown", "name": "踩", "char": "👎"},
    {"id": "clap", "name": "鼓掌", "char": "👏"},
    {"id": "party", "name": "庆祝", "char": "🎉"},
    {"id": "fire", "name": "火", "char": "🔥"},
    {"id": "star", "name": "星星", "char": "⭐"},
    {"id": "heart", "name": "比心", "char": "💖"},
    {"id": "rose", "name": "玫瑰", "char": "🌹"},
    {"id": "coffee", "name": "咖啡", "char": "☕"},
    {"id": "sun", "name": "太阳", "char": "☀️"},
    {"id": "moon", "name": "月亮", "char": "🌙"},
    {"id": "rainbow", "name": "彩虹", "char": "🌈"},
    {"id": "music", "name": "音乐", "char": "🎵"},
    {"id": "game", "name": "游戏", "char": "🎮"},
    {"id": "rocket", "name": "火箭", "char": "🚀"},
]

@app.get("/api/v1/emojis")
async def list_emojis():
    return EMOJI_LIST

# ========== 群管理 ==========
class KickReq(BaseModel):
    user_id: int

class MuteReq(BaseModel):
    user_id: int
    minutes: int  # 0=取消禁言

class TransferReq(BaseModel):
    user_id: int

class AnnouncementReq(BaseModel):
    announcement: str

@app.get("/api/v1/conversations/{conv_id}/members")
async def list_members(conv_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMember).where(ConversationMember.conversation_id == conv_id)
        )
        members = result.scalars().all()
        user_ids = [m.user_id for m in members]
        if not user_ids:
            return []
        result = await session.execute(select(User).where(User.id.in_(user_ids)))
        users = result.scalars().all()
        user_map = {u.id: user_to_dict(u) for u in users}
        result = []
        for m in members:
            u = user_map.get(m.user_id, {})
            u["role"] = m.role
            u["muted_until"] = m.muted_until.isoformat() if m.muted_until else None
            result.append(u)
        return result

@app.post("/api/v1/conversations/{conv_id}/kick")
async def kick_member(conv_id: int, req: KickReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(Conversation).where(Conversation.id == conv_id))
        conv = result.scalar_one_or_none()
        if not conv or conv.type != "group":
            raise HTTPException(404, "群聊不存在")
        result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == user.id
            )
        )
        my_member = result.scalar_one_or_none()
        if not my_member or my_member.role not in ["owner", "admin"]:
            raise HTTPException(403, "无权限")
        result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == req.user_id
            )
        )
        target = result.scalar_one_or_none()
        if not target:
            raise HTTPException(404, "用户不在群里")
        if target.role == "owner":
            raise HTTPException(400, "不能踢出群主")
        await session.delete(target)
        await session.commit()
        return {"success": True}

@app.post("/api/v1/conversations/{conv_id}/mute")
async def mute_member(conv_id: int, req: MuteReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == user.id
            )
        )
        my_member = result.scalar_one_or_none()
        if not my_member or my_member.role not in ["owner", "admin"]:
            raise HTTPException(403, "无权限")
        result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == req.user_id
            )
        )
        target = result.scalar_one_or_none()
        if not target:
            raise HTTPException(404, "用户不在群里")
        if req.minutes > 0:
            target.muted_until = datetime.utcnow() + timedelta(minutes=req.minutes)
        else:
            target.muted_until = None
        await session.commit()
        return {"success": True, "muted_until": target.muted_until.isoformat() if target.muted_until else None}

@app.post("/api/v1/conversations/{conv_id}/transfer")
async def transfer_owner(conv_id: int, req: TransferReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == user.id,
                ConversationMember.role == "owner"
            )
        )
        my_member = result.scalar_one_or_none()
        if not my_member:
            raise HTTPException(403, "只有群主可以转让")
        result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == req.user_id
            )
        )
        target = result.scalar_one_or_none()
        if not target:
            raise HTTPException(404, "用户不在群里")
        my_member.role = "member"
        target.role = "owner"
        result = await session.execute(select(Conversation).where(Conversation.id == conv_id))
        conv = result.scalar_one_or_none()
        if conv:
            conv.owner_id = req.user_id
        await session.commit()
        return {"success": True}

@app.put("/api/v1/conversations/{conv_id}/announcement")
async def set_announcement(conv_id: int, req: AnnouncementReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == user.id
            )
        )
        my_member = result.scalar_one_or_none()
        if not my_member or my_member.role not in ["owner", "admin"]:
            raise HTTPException(403, "无权限")
        result = await session.execute(select(Conversation).where(Conversation.id == conv_id))
        conv = result.scalar_one_or_none()
        if conv:
            conv.announcement = req.announcement
            await session.commit()
        return {"success": True, "announcement": req.announcement}

# ========== 管理员 ==========
class AdminLoginReq(BaseModel):
    password: str

@app.post("/api/v1/admin/login")
async def admin_login(req: AdminLoginReq):
    if req.password != ADMIN_PASSWORD:
        raise HTTPException(401, "管理员密码错误")
    token = create_access_token({"sub": "admin", "is_admin": True}, timedelta(hours=24))
    return {"access_token": token, "token_type": "bearer"}

async def get_admin(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("is_admin"):
            raise HTTPException(403, "需要管理员权限")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return True

@app.get("/api/v1/admin/stats")
async def admin_stats(admin: bool = Depends(get_admin)):
    async with async_session() as session:
        user_count = (await session.execute(select(func.count(User.id)))).scalar()
        msg_count = (await session.execute(select(func.count(Message.id)))).scalar()
        group_count = (await session.execute(select(func.count(Conversation.id)).where(Conversation.type == "group"))).scalar()
        bot_count = (await session.execute(select(func.count(Bot.id)))).scalar()
        online_count = (await session.execute(select(func.count(User.id)).where(User.status == "online"))).scalar()
        return {
            "users": user_count, "messages": msg_count,
            "groups": group_count, "bots": bot_count,
            "online": online_count
        }

@app.get("/api/v1/admin/users")
async def admin_users(admin: bool = Depends(get_admin)):
    async with async_session() as session:
        result = await session.execute(select(User).order_by(User.id.desc()).limit(100))
        users = result.scalars().all()
        return [user_to_dict(u) for u in users]

@app.delete("/api/v1/admin/users/{user_id}")
async def admin_delete_user(user_id: int, admin: bool = Depends(get_admin)):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        u = result.scalar_one_or_none()
        if not u:
            raise HTTPException(404, "用户不存在")
        await session.delete(u)
        await session.commit()
        return {"success": True}

# ========== Bot API (REST) ==========
@app.get("/bot-api/me")
async def bot_me(bot: Bot = Depends(get_bot_from_key)):
    return {"bot": bot_to_dict(bot), "user_id": bot.id + 1000000}

@app.get("/bot-api/conversations/{conv_id}")
async def bot_get_conversation(conv_id: int, bot: Bot = Depends(get_bot_from_key)):
    async with async_session() as session:
        result = await session.execute(select(Conversation).where(Conversation.id == conv_id))
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(404, "会话不存在")
        result = await session.execute(
            select(func.count(ConversationMember.id)).where(ConversationMember.conversation_id == conv_id)
        )
        member_count = result.scalar()
        return {
            "id": conv.id, "type": conv.type, "title": conv.title,
            "owner_id": conv.owner_id, "announcement": conv.announcement,
            "member_count": member_count, "is_official": conv.is_official,
            "created_at": conv.created_at.isoformat() if conv.created_at else None
        }

@app.get("/bot-api/conversations/{conv_id}/members")
async def bot_list_members(conv_id: int, bot: Bot = Depends(get_bot_from_key)):
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMember).where(ConversationMember.conversation_id == conv_id)
        )
        members = result.scalars().all()
        user_ids = [m.user_id for m in members]
        if not user_ids:
            return []
        result = await session.execute(select(User).where(User.id.in_(user_ids)))
        users = result.scalars().all()
        user_map = {u.id: user_to_dict(u) for u in users}
        result = []
        for m in members:
            u = user_map.get(m.user_id, {})
            u["role"] = m.role
            result.append(u)
        return result

@app.get("/bot-api/conversations/{conv_id}/messages")
async def bot_get_messages(conv_id: int, limit: int = 50, bot: Bot = Depends(get_bot_from_key)):
    async with async_session() as session:
        result = await session.execute(
            select(Message).where(Message.conversation_id == conv_id)
            .order_by(Message.id.desc()).limit(limit)
        )
        msgs = list(reversed(result.scalars().all()))
        result = []
        for m in msgs:
            result.append({
                "id": m.id, "conversation_id": m.conversation_id,
                "sender_id": m.sender_id, "content": m.content,
                "message_type": m.message_type,
                "created_at": m.created_at.isoformat() if m.created_at else None
            })
        return result

@app.post("/bot-api/conversations/{conv_id}/messages")
async def bot_send_message(conv_id: int, req: BotSendMsgReq, bot: Bot = Depends(get_bot_from_key)):
    bot_user_id = bot.id + 1000000
    async with async_session() as session:
        msg = Message(
            conversation_id=conv_id, sender_id=bot_user_id,
            content=req.message, message_type="text"
        )
        session.add(msg)
        await session.commit()
        await session.refresh(msg)
        msg_data = {
            "id": msg.id, "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id, "content": msg.content,
            "message_type": msg.message_type,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
            "sender": {"id": bot_user_id, "username": bot.name, "nickname": bot.name, "is_bot": True}
        }
        await manager.broadcast_to_conversation(conv_id, {"type": "message.created", "data": msg_data})
        return msg_data

@app.post("/bot-api/users/{user_id}/messages")
async def bot_send_dm(user_id: int, req: BotSendMsgReq, bot: Bot = Depends(get_bot_from_key)):
    bot_user_id = bot.id + 1000000
    async with async_session() as session:
        # 查找或创建私聊
        result = await session.execute(
            select(Conversation.id).where(Conversation.type == "direct")
            .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
            .where(ConversationMember.user_id.in_([bot_user_id, user_id]))
            .group_by(Conversation.id)
            .having(func.count(ConversationMember.id) == 2)
        )
        conv_id = result.scalar_one_or_none()
        if not conv_id:
            conv = Conversation(type="direct", title=f"机器人-{user_id}")
            session.add(conv)
            await session.commit()
            await session.refresh(conv)
            conv_id = conv.id
            session.add(ConversationMember(conversation_id=conv_id, user_id=bot_user_id))
            session.add(ConversationMember(conversation_id=conv_id, user_id=user_id))
            await session.commit()
        msg = Message(
            conversation_id=conv_id, sender_id=bot_user_id,
            content=req.message, message_type="text"
        )
        session.add(msg)
        await session.commit()
        await session.refresh(msg)
        msg_data = {
            "id": msg.id, "conversation_id": msg.conversation_id,
            "sender_id": msg.sender_id, "content": msg.content,
            "message_type": msg.message_type,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
            "sender": {"id": bot_user_id, "username": bot.name, "nickname": bot.name, "is_bot": True}
        }
        await manager.send_to_user(user_id, {"type": "message.created", "data": msg_data})
        return msg_data

# ========== KukeChat 兼容 API 层 ==========
# 修改加入群聊返回完整 Conversation 对象
@app.post("/api/v1/conversations/{conversation_id}/join")
async def join_group_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Conversation).where(
                (Conversation.id == compat_conversation_id) & (Conversation.type == "group")
            )
        )
        conv = result.scalar_one_or_none()
        if not conv:
            raise HTTPException(404, "群聊不存在")
        member_result = await session.execute(
            select(ConversationMember).where(
                (ConversationMember.conversation_id == compat_conversation_id) &
                (ConversationMember.user_id == user.id)
            )
        )
        if member_result.scalar_one_or_none():
            return conversation_to_dict(conv, session, user.id)
        session.add(ConversationMember(conversation_id=compat_conversation_id, user_id=user.id))
        await session.commit()
        await session.refresh(conv)
        return conversation_to_dict(conv, session, user.id)

async def conversation_to_dict(conv, session, current_user_id=None):
    """转换为 KukeChat 兼容的 Conversation 对象"""
    count_result = await session.execute(
        select(func.count(ConversationMember.id)).where(ConversationMember.conversation_id == conv.id)
    )
    member_count = count_result.scalar() or 0
    title = conv.title
    if conv.type == "direct" and current_user_id:
        member_result = await session.execute(
            select(ConversationMember.user_id).where(ConversationMember.conversation_id == conv.id)
        )
        member_ids = [row[0] for row in member_result.fetchall()]
        other_id = next((uid for uid in member_ids if uid != current_user_id), current_user_id)
        user_result = await session.execute(select(User).where(User.id == other_id))
        other = user_result.scalar_one_or_none()
        title = other.nickname if other else "未知用户"
    return {
        "id": conv.id, "type": conv.type, "title": title,
        "owner_id": conv.owner_id, "announcement": conv.announcement or "",
        "is_official": conv.is_official, "member_count": member_count,
        "created_at": conv.created_at.isoformat() if conv.created_at else None
    }

# 群成员分页格式兼容
@app.get("/api/v1/conversations/{conversation_id}/members")
async def list_members_kuke(compat_conversation_id: int, limit: int = 20, offset: int = 0, search: str = "", user: User = Depends(get_current_user)):
    async with async_session() as session:
        query = select(ConversationMember, User).join(User, ConversationMember.user_id == User.id).where(
            ConversationMember.conversation_id == compat_conversation_id
        )
        if search:
            query = query.where((User.username.contains(search.lower())) | (User.nickname.contains(search)))
        total_result = await session.execute(
            select(func.count(ConversationMember.id)).where(ConversationMember.conversation_id == compat_conversation_id)
        )
        total = total_result.scalar() or 0
        result = await session.execute(query.offset(offset).limit(limit))
        members = []
        for member, u in result.fetchall():
            d = user_to_dict(u)
            d["role"] = member.role
            d["muted_until"] = member.muted_until.isoformat() if member.muted_until else None
            d["joined_at"] = member.joined_at.isoformat() if member.joined_at else None
            members.append(d)
        return {
            "items": members, "total": total,
            "limit": limit, "offset": offset,
            "has_more": offset + len(members) < total
        }

# PATCH 更新群资料
class KukeProfileReq(BaseModel):
    title: str = None
    avatar_url: str = None

@app.patch("/api/v1/conversations/{conversation_id}/profile")
async def update_profile_kuke(compat_conversation_id: int, req: KukeProfileReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, compat_conversation_id)
        if not conv or conv.type != "group":
            raise HTTPException(404, "群聊不存在")
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member:
            raise HTTPException(403, "不是群成员")
        if member.role != "owner":
            raise HTTPException(403, "只有群主可以修改资料")
        if req.title is not None:
            conv.title = req.title[:100]
        await session.commit()
        await session.refresh(conv)
        return await conversation_to_dict(conv, session, user.id)

# PATCH 更新群设置
class KukeSettingsReq(BaseModel):
    join_policy: str = None
    allow_member_invite: bool = None

@app.patch("/api/v1/conversations/{conversation_id}/settings")
async def update_settings_kuke(compat_conversation_id: int, req: KukeSettingsReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, compat_conversation_id)
        if not conv:
            raise HTTPException(404, "群聊不存在")
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member or member.role not in ("owner", "admin"):
            raise HTTPException(403, "无权限")
        return await conversation_to_dict(conv, session, user.id)

# PATCH 更新公告
class KukeAnnouncementReq(BaseModel):
    announcement: str = ""

@app.patch("/api/v1/conversations/{conversation_id}/announcement")
async def update_announcement_kuke(compat_conversation_id: int, req: KukeAnnouncementReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, compat_conversation_id)
        if not conv:
            raise HTTPException(404, "群聊不存在")
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member or member.role not in ("owner", "admin"):
            raise HTTPException(403, "无权限")
        conv.announcement = req.announcement[:500]
        await session.commit()
        await session.refresh(conv)
        return await conversation_to_dict(conv, session, user.id)

# PATCH 设置成员角色
class KukeRoleReq(BaseModel):
    role: str

@app.patch("/api/v1/conversations/{conversation_id}/members/{user_id}/role")
async def set_role_kuke(compat_conversation_id: int, user_id: int, req: KukeRoleReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member or member.role != "owner":
            raise HTTPException(403, "只有群主可以设置管理员")
        target = await get_member_role(session, compat_conversation_id, user_id)
        if not target:
            raise HTTPException(404, "用户不在群内")
        if req.role not in ("admin", "member"):
            raise HTTPException(400, "无效角色")
        target.role = req.role
        await session.commit()
        u_result = await session.execute(select(User).where(User.id == user_id))
        u = u_result.scalar_one_or_none()
        d = user_to_dict(u) if u else {}
        d["role"] = target.role
        return d

# PATCH 禁言
class KukeMuteReq(BaseModel):
    muted: bool = False
    muted_until: str = None

@app.patch("/api/v1/conversations/{conversation_id}/members/{user_id}/mute")
async def mute_kuke(compat_conversation_id: int, user_id: int, req: KukeMuteReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member or member.role not in ("owner", "admin"):
            raise HTTPException(403, "无权限")
        target = await get_member_role(session, compat_conversation_id, user_id)
        if not target:
            raise HTTPException(404, "用户不在群内")
        if target.role == "owner":
            raise HTTPException(403, "不能禁言群主")
        if req.muted and req.muted_until:
            try:
                target.muted_until = datetime.fromisoformat(req.muted_until.replace("Z", "+00:00"))
            except:
                target.muted_until = datetime.utcnow() + timedelta(minutes=60)
        elif req.muted:
            target.muted_until = datetime.utcnow() + timedelta(minutes=60)
        else:
            target.muted_until = None
        await session.commit()
        u_result = await session.execute(select(User).where(User.id == user_id))
        u = u_result.scalar_one_or_none()
        d = user_to_dict(u) if u else {}
        d["role"] = target.role
        d["muted_until"] = target.muted_until.isoformat() if target.muted_until else None
        return d

# DELETE 踢人
@app.delete("/api/v1/conversations/{conversation_id}/members/{user_id}")
async def kick_kuke(compat_conversation_id: int, user_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member or member.role not in ("owner", "admin"):
            raise HTTPException(403, "无权限")
        target = await get_member_role(session, compat_conversation_id, user_id)
        if not target:
            raise HTTPException(404, "用户不在群里")
        if target.role == "owner":
            raise HTTPException(400, "不能踢出群主")
        await session.delete(target)
        await session.commit()
        return {"success": True}

# DELETE 退群
@app.delete("/api/v1/conversations/{conversation_id}/members/me")
async def leave_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, compat_conversation_id)
        if not conv or conv.type != "group":
            raise HTTPException(404, "群聊不存在")
        if conv.owner_id == user.id:
            raise HTTPException(400, "群主不能退出，请先转让或解散")
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member:
            raise HTTPException(403, "不是群成员")
        await session.delete(member)
        await session.commit()
        return {"success": True}

# GET 单个成员信息
@app.get("/api/v1/conversations/{conversation_id}/members/{user_id}")
async def get_member_kuke(compat_conversation_id: int, user_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, compat_conversation_id, user_id)
        if not member:
            raise HTTPException(404, "用户不在群内")
        u_result = await session.execute(select(User).where(User.id == user_id))
        u = u_result.scalar_one_or_none()
        d = user_to_dict(u) if u else {}
        d["role"] = member.role
        d["muted_until"] = member.muted_until.isoformat() if member.muted_until else None
        return d

# POST 添加成员
class KukeAddMembersReq(BaseModel):
    user_ids: list

@app.post("/api/v1/conversations/{conversation_id}/members")
async def add_members_kuke(compat_conversation_id: int, req: KukeAddMembersReq, user: User = Depends(get_current_user)):
    async with async_session() as session:
        member = await get_member_role(session, compat_conversation_id, user.id)
        if not member:
            raise HTTPException(403, "不是群成员")
        added = []
        for uid in req.user_ids:
            existing = await get_member_role(session, compat_conversation_id, uid)
            if not existing:
                session.add(ConversationMember(conversation_id=compat_conversation_id, user_id=uid))
                added.append(uid)
        await session.commit()
        return [{"user_id": uid} for uid in added]

# 搜索群聊
@app.get("/api/v1/conversations/groups/search")
async def search_groups_kuke(q: str = "", user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Conversation).where(
                (Conversation.type == "group") & (Conversation.title.contains(q))
            ).limit(20)
        )
        groups = result.scalars().all()
        return [await conversation_to_dict(g, session, user.id) for g in groups]

# 推荐群聊
@app.get("/api/v1/conversations/groups/recommended")
async def recommended_groups_kuke(user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(Conversation).where(Conversation.is_official == True).limit(10)
        )
        groups = result.scalars().all()
        return [await conversation_to_dict(g, session, user.id) for g in groups]

# 清空聊天记录
@app.post("/api/v1/conversations/{conversation_id}/clear")
async def clear_history_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"success": True}

# 上传头像（返回假URL）
@app.post("/api/v1/uploads/avatar")
async def upload_avatar_kuke(user: User = Depends(get_current_user)):
    return {"url": ""}

# ========== KukeChat 认证兼容 ==========
@app.get("/api/v1/auth/session")
async def get_session_kuke():
    raise HTTPException(401, "no session")

@app.post("/api/v1/auth/session/logout")
async def logout_session_kuke():
    return {"success": True}

@app.post("/api/v1/auth/ip-login")
async def ip_login_kuke():
    raise HTTPException(400, "ip login not supported")

@app.get("/api/v1/auth/ip-login/status")
async def ip_login_status_kuke():
    return {"enabled": False, "remembered": False}

@app.get("/api/v1/auth/account-lookup")
async def account_lookup_kuke(username: str = ""):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == username.lower()))
        u = result.scalar_one_or_none()
        return {"exists": u is not None, "has_password": True if u else False}

@app.post("/api/v1/auth/password-reset-requests")
async def password_reset_kuke():
    return {"success": True}

@app.post("/api/v1/auth/password-reset/ccw/challenge")
async def password_reset_challenge_kuke():
    return {"challenge_id": "123"}

@app.post("/api/v1/auth/password-reset/ccw/confirm")
async def password_reset_confirm_kuke():
    return {"ok": True}

@app.post("/api/v1/auth/password/change/challenge")
async def password_change_challenge_kuke(user: User = Depends(get_current_user)):
    return {"challenge_id": "123"}

@app.post("/api/v1/auth/password/change/confirm")
async def password_change_confirm_kuke(user: User = Depends(get_current_user)):
    return {"ok": True}

# ========== KukeChat 好友请求兼容 ==========
@app.get("/api/v1/friends/requests/outgoing")
async def outgoing_requests_kuke(user: User = Depends(get_current_user)):
    return []

@app.post("/api/v1/friends/requests/{request_id}/accept")
async def accept_request_kuke(request_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(FriendRequest).where(
                (FriendRequest.id == request_id) & (FriendRequest.receiver_id == user.id)
            )
        )
        fr = result.scalar_one_or_none()
        if not fr:
            raise HTTPException(404, "请求不存在")
        fr.status = "accepted"
        session.add(Friendship(user_id=fr.sender_id, friend_id=user.id))
        session.add(Friendship(user_id=user.id, friend_id=fr.sender_id))
        await session.commit()
        return {"status": "accepted"}

@app.post("/api/v1/friends/requests/{request_id}/reject")
async def reject_request_kuke(request_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(FriendRequest).where(
                (FriendRequest.id == request_id) & (FriendRequest.receiver_id == user.id)
            )
        )
        fr = result.scalar_one_or_none()
        if not fr:
            raise HTTPException(404, "请求不存在")
        fr.status = "rejected"
        await session.commit()
        return {"status": "rejected"}

@app.delete("/api/v1/friends/{friend_id}")
async def delete_friend_kuke(friend_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        await session.execute(
            delete(Friendship).where(
                ((Friendship.user_id == user.id) & (Friendship.friend_id == friend_id)) |
                ((Friendship.user_id == friend_id) & (Friendship.friend_id == user.id))
            )
        )
        await session.commit()
        return {"success": True}

# ========== KukeChat 群加入请求兼容（存根）==========
@app.post("/api/v1/conversations/{conversation_id}/join-requests")
async def create_join_request_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"id": 0, "status": "pending"}

@app.get("/api/v1/conversations/join-requests/incoming")
async def incoming_join_requests_kuke(user: User = Depends(get_current_user)):
    return []

@app.get("/api/v1/conversations/join-requests/outgoing")
async def outgoing_join_requests_kuke(user: User = Depends(get_current_user)):
    return []

@app.post("/api/v1/conversations/join-requests/{request_id}/accept")
async def accept_join_request_kuke(request_id: int, user: User = Depends(get_current_user)):
    return {"status": "accepted"}

@app.post("/api/v1/conversations/join-requests/{request_id}/reject")
async def reject_join_request_kuke(request_id: int, user: User = Depends(get_current_user)):
    return {"status": "rejected"}

# ========== KukeChat 签到/排行榜（存根）==========
@app.get("/api/v1/conversations/{conversation_id}/checkin/me")
async def checkin_status_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"checked_in": False, "streak": 0, "total": 0}

@app.post("/api/v1/conversations/{conversation_id}/checkin")
async def checkin_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"checked_in": True, "streak": 1, "total": 1}

@app.get("/api/v1/conversations/{conversation_id}/leaderboard")
async def leaderboard_kuke(compat_conversation_id: int, type: str = "activity", period: str = "all"):
    return {"items": [], "period": period, "type": type}

# ========== KukeChat 群公告列表（存根）==========
@app.get("/api/v1/conversations/{conversation_id}/announcements")
async def list_announcements_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    async with async_session() as session:
        conv = await session.get(Conversation, compat_conversation_id)
        if conv and conv.announcement:
            return [{"id": 1, "content": conv.announcement, "created_at": datetime.utcnow().isoformat()}]
        return []

@app.post("/api/v1/conversations/{conversation_id}/announcements")
async def create_announcement_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"id": 1, "content": ""}

@app.delete("/api/v1/conversations/{conversation_id}/announcements/{announcement_id}")
async def delete_announcement_kuke(compat_conversation_id: int, announcement_id: int, user: User = Depends(get_current_user)):
    return {"success": True}

@app.patch("/api/v1/conversations/{conversation_id}/announcements/{announcement_id}")
async def update_announcement_kuke(compat_conversation_id: int, announcement_id: int, user: User = Depends(get_current_user)):
    return {"id": announcement_id, "content": ""}

# ========== KukeChat 成员头衔/设置（存根）==========
@app.patch("/api/v1/conversations/{conversation_id}/members/{user_id}/title")
async def set_member_title_kuke(compat_conversation_id: int, user_id: int, user: User = Depends(get_current_user)):
    return {"success": True}

@app.patch("/api/v1/conversations/{conversation_id}/members/me/settings")
async def update_my_settings_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"success": True}

@app.get("/api/v1/conversations/{conversation_id}/members/search")
async def search_members_kuke(compat_conversation_id: int, q: str = "", limit: int = 12, user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(
            select(ConversationMember, User).join(User, ConversationMember.user_id == User.id).where(
                (ConversationMember.conversation_id == compat_conversation_id) &
                ((User.username.contains(q.lower())) | (User.nickname.contains(q)))
            ).limit(limit)
        )
        members = []
        for member, u in result.fetchall():
            d = user_to_dict(u)
            d["role"] = member.role
            members.append(d)
        return members

# ========== KukeChat 临时会话（存根）==========
@app.post("/api/v1/conversations/{conversation_id}/temporary/close")
async def close_temporary_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"success": True}

@app.post("/api/v1/conversations/{conversation_id}/temporary/block")
async def block_temporary_kuke(compat_conversation_id: int, user: User = Depends(get_current_user)):
    return {"success": True}

# ========== KukeChat 通知（存根）==========
@app.get("/api/v1/notifications")
async def list_notifications_kuke(user: User = Depends(get_current_user)):
    return []

@app.post("/api/v1/notifications/read")
async def read_notifications_kuke(user: User = Depends(get_current_user)):
    return {"success": True}

# ========== KukeChat 邀请（存根）==========
@app.post("/api/v1/invites")
async def create_invite_kuke(user: User = Depends(get_current_user)):
    return {"token": "invite123"}

@app.get("/api/v1/invites/{token}")
async def get_invite_kuke(token: str):
    return {"token": token, "valid": False}

@app.post("/api/v1/invites/{token}/accept")
async def accept_invite_kuke(token: str, user: User = Depends(get_current_user)):
    return {"success": True}

# ========== KukeChat 在线用户 ==========
@app.get("/api/v1/users/online")
async def online_users_kuke(user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(User).where(User.status == "online").limit(100))
        users = result.scalars().all()
        return {"users": [user_to_dict(u) for u in users if u.id != user.id], "online_count": len(users)}

@app.get("/api/v1/users/online-count")
async def online_count_kuke(user: User = Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(func.count(User.id)).where(User.status == "online"))
        return {"online_count": result.scalar() or 0}

# ========== 机器人广场完整 API ==========
@app.get("/api/v1/bots/square")
async def bot_square(q: str = "", limit: int = 20, offset: int = 0):
    async with async_session() as session:
        query = select(Bot).where(Bot.is_public == True)
        if q:
            query = query.where(Bot.name.ilike(f"%{q}%"))
        query = query.order_by(Bot.install_count.desc()).offset(offset).limit(limit)
        result = await session.execute(query)
        bots = result.scalars().all()
        total = await session.execute(select(func.count(Bot.id)).where(Bot.is_public == True))
        return {"items": [bot_to_dict(b) for b in bots], "total": total.scalar() or 0, "limit": limit, "offset": offset}

@app.get("/api/v1/bots/mine")
async def my_bots(user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(Bot).where(Bot.owner_id == user.id).order_by(Bot.created_at.desc()))
        bots = result.scalars().all()
        return [bot_to_dict(b) for b in bots]

@app.post("/api/v1/bots")
async def create_bot(payload: dict, user=Depends(get_current_user)):
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(400, "机器人名称不能为空")
    bot_key = "jj_" + secrets.token_urlsafe(24)
    async with async_session() as session:
        bot = Bot(name=name, description=payload.get("description", ""), bot_key=bot_key,
                  owner_id=user.id, is_public=payload.get("is_public", True),
                  avatar_url=payload.get("avatar_url", ""), category=payload.get("category", "general"))
        session.add(bot)
        await session.commit()
        await session.refresh(bot)
        return {"id": bot.id, "name": bot.name, "description": bot.description, "bot_key": bot.bot_key,
                "is_public": bot.is_public, "avatar_url": bot.avatar_url, "category": bot.category,
                "is_online": bot.is_online, "install_count": 0, "rating": 0, "review_count": 0,
                "created_at": bot.created_at.isoformat()}

@app.get("/api/v1/bots/{bot_id}")
async def get_bot(bot_id: int):
    async with async_session() as session:
        bot = await session.get(Bot, bot_id)
        if not bot:
            raise HTTPException(404, "机器人不存在")
        return bot_to_dict(bot)

@app.patch("/api/v1/bots/{bot_id}")
async def update_bot(bot_id: int, payload: dict, user=Depends(get_current_user)):
    async with async_session() as session:
        bot = await session.get(Bot, bot_id)
        if not bot or bot.owner_id != user.id:
            raise HTTPException(403, "无权限")
        for field in ["name", "description", "is_public", "avatar_url", "category"]:
            if field in payload:
                setattr(bot, field, payload[field])
        await session.commit()
        await session.refresh(bot)
        return bot_to_dict(bot)

@app.delete("/api/v1/bots/{bot_id}")
async def delete_bot(bot_id: int, user=Depends(get_current_user)):
    async with async_session() as session:
        bot = await session.get(Bot, bot_id)
        if not bot or bot.owner_id != user.id:
            raise HTTPException(403, "无权限")
        await session.delete(bot)
        await session.commit()
        return {"ok": True}

@app.get("/api/v1/bots/{bot_id}/dashboard")
async def bot_dashboard(bot_id: int, user=Depends(get_current_user)):
    async with async_session() as session:
        bot = await session.get(Bot, bot_id)
        if not bot or bot.owner_id != user.id:
            raise HTTPException(403, "无权限")
        installs = await session.execute(select(func.count(BotInstallation.id)).where(BotInstallation.bot_id == bot_id))
        reviews = await session.execute(select(func.count(BotReview.id)).where(BotReview.bot_id == bot_id))
        return {"bot_id": bot_id, "install_count": installs.scalar() or 0, "review_count": reviews.scalar() or 0,
                "is_online": bot.is_online, "last_seen": bot.last_seen.isoformat() if bot.last_seen else None,
                "message_count": 0, "active_users": 0}

@app.post("/api/v1/bots/{bot_id}/rotate-key")
async def rotate_bot_key(bot_id: int, user=Depends(get_current_user)):
    async with async_session() as session:
        bot = await session.get(Bot, bot_id)
        if not bot or bot.owner_id != user.id:
            raise HTTPException(403, "无权限")
        new_key = "jj_" + secrets.token_urlsafe(24)
        bot.bot_key = new_key
        await session.commit()
        return {"bot_id": bot_id, "key": new_key, "key_prefix": new_key[:12]}

@app.post("/api/v1/bots/{bot_id}/install")
async def install_bot(bot_id: int, payload: dict, user=Depends(get_current_user)):
    conv_id = payload.get("conversation_id")
    if not conv_id:
        raise HTTPException(400, "缺少会话ID")
    async with async_session() as session:
        bot = await session.get(Bot, bot_id)
        if not bot:
            raise HTTPException(404, "机器人不存在")
        existing = await session.execute(select(BotInstallation).where(
            BotInstallation.bot_id == bot_id, BotInstallation.conversation_id == conv_id))
        if existing.scalar_one_or_none():
            raise HTTPException(400, "机器人已安装")
        inst = BotInstallation(bot_id=bot_id, conversation_id=conv_id, installed_by=user.id,
                               enabled=payload.get("enabled", True), receive_messages=payload.get("receive_messages", True))
        session.add(inst)
        bot.install_count = (bot.install_count or 0) + 1
        await session.commit()
        await session.refresh(inst)
        return {"id": inst.id, "bot_id": bot_id, "conversation_id": conv_id, "enabled": inst.enabled,
                "receive_messages": inst.receive_messages, "created_at": inst.created_at.isoformat()}

@app.get("/api/v1/bots/conversations/{conversation_id}/bots")
async def conversation_bots(conversation_id: int):
    async with async_session() as session:
        result = await session.execute(select(BotInstallation).where(BotInstallation.conversation_id == conversation_id))
        installs = result.scalars().all()
        output = []
        for inst in installs:
            bot = await session.get(Bot, inst.bot_id)
            if bot:
                output.append({"id": inst.id, "bot_id": bot.id, "bot_name": bot.name, "bot_avatar": bot.avatar_url,
                               "conversation_id": conversation_id, "enabled": inst.enabled, "is_online": bot.is_online,
                               "created_at": inst.created_at.isoformat()})
        return output

@app.delete("/api/v1/bots/{bot_id}/installations/{conversation_id}")
async def remove_bot_installation(bot_id: int, conversation_id: int, user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(BotInstallation).where(
            BotInstallation.bot_id == bot_id, BotInstallation.conversation_id == conversation_id))
        inst = result.scalar_one_or_none()
        if inst:
            await session.delete(inst)
            bot = await session.get(Bot, bot_id)
            if bot and bot.install_count:
                bot.install_count -= 1
            await session.commit()
        return {"ok": True}

@app.get("/api/v1/bots/{bot_id}/reviews")
async def bot_reviews(bot_id: int):
    async with async_session() as session:
        result = await session.execute(select(BotReview).where(BotReview.bot_id == bot_id).order_by(BotReview.created_at.desc()))
        reviews = result.scalars().all()
        output = []
        for r in reviews:
            user = await session.get(User, r.user_id)
            output.append({"id": r.id, "bot_id": r.bot_id, "user_id": r.user_id,
                           "user_name": user.nickname if user else "用户", "rating": r.rating,
                           "content": r.content, "likes_count": r.likes_count, "created_at": r.created_at.isoformat()})
        return output

@app.put("/api/v1/bots/{bot_id}/reviews/me")
async def upsert_bot_review(bot_id: int, payload: dict, user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(BotReview).where(
            BotReview.bot_id == bot_id, BotReview.user_id == user.id))
        review = result.scalar_one_or_none()
        if review:
            review.rating = payload.get("rating", 5)
            review.content = payload.get("content", "")
        else:
            review = BotReview(bot_id=bot_id, user_id=user.id, rating=payload.get("rating", 5),
                               content=payload.get("content", ""))
            session.add(review)
        await session.commit()
        await session.refresh(review)
        return {"id": review.id, "bot_id": bot_id, "user_id": user.id, "rating": review.rating,
                "content": review.content, "created_at": review.created_at.isoformat()}

# ========== 动态/帖子 API ==========
@app.get("/api/v1/posts")
async def list_posts(limit: int = 20, offset: int = 0):
    async with async_session() as session:
        result = await session.execute(select(Post).where(Post.is_deleted == False).order_by(Post.created_at.desc()).offset(offset).limit(limit))
        posts = result.scalars().all()
        output = []
        for p in posts:
            author = await session.get(User, p.author_id)
            output.append({"id": p.id, "author_id": p.author_id, "author_name": author.nickname if author else "用户",
                           "author_avatar": author.avatar if author else "", "content": p.content,
                           "images": json.loads(p.images) if p.images else [], "likes_count": p.likes_count,
                           "comments_count": p.comments_count, "created_at": p.created_at.isoformat()})
        return output

@app.post("/api/v1/posts")
async def create_post(payload: dict, user=Depends(get_current_user)):
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(400, "内容不能为空")
    async with async_session() as session:
        post = Post(author_id=user.id, content=content, images=json.dumps(payload.get("images", [])))
        session.add(post)
        await session.commit()
        await session.refresh(post)
        return {"id": post.id, "author_id": user.id, "author_name": user.nickname, "content": content,
                "images": json.loads(post.images) if post.images else [], "likes_count": 0,
                "comments_count": 0, "created_at": post.created_at.isoformat()}

@app.post("/api/v1/posts/{post_id}/like")
async def toggle_post_like(post_id: int, user=Depends(get_current_user)):
    async with async_session() as session:
        post = await session.get(Post, post_id)
        if not post:
            raise HTTPException(404, "动态不存在")
        result = await session.execute(select(PostLike).where(
            PostLike.post_id == post_id, PostLike.user_id == user.id))
        like = result.scalar_one_or_none()
        if like:
            await session.delete(like)
            post.likes_count = max(0, (post.likes_count or 0) - 1)
            liked = False
        else:
            session.add(PostLike(post_id=post_id, user_id=user.id))
            post.likes_count = (post.likes_count or 0) + 1
            liked = True
        await session.commit()
        return {"liked": liked, "likes_count": post.likes_count}

@app.get("/api/v1/posts/{post_id}/comments")
async def list_post_comments(post_id: int):
    async with async_session() as session:
        result = await session.execute(select(PostComment).where(PostComment.post_id == post_id).order_by(PostComment.created_at.asc()))
        comments = result.scalars().all()
        output = []
        for c in comments:
            author = await session.get(User, c.author_id)
            output.append({"id": c.id, "post_id": post_id, "author_id": c.author_id,
                           "author_name": author.nickname if author else "用户", "content": c.content,
                           "created_at": c.created_at.isoformat()})
        return output

@app.post("/api/v1/posts/{post_id}/comments")
async def create_post_comment(post_id: int, payload: dict, user=Depends(get_current_user)):
    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(400, "评论内容不能为空")
    async with async_session() as session:
        post = await session.get(Post, post_id)
        if not post:
            raise HTTPException(404, "动态不存在")
        comment = PostComment(post_id=post_id, author_id=user.id, content=content)
        session.add(comment)
        post.comments_count = (post.comments_count or 0) + 1
        await session.commit()
        await session.refresh(comment)
        return {"id": comment.id, "post_id": post_id, "author_id": user.id, "author_name": user.nickname,
                "content": content, "created_at": comment.created_at.isoformat()}

# ========== 任务 API ==========
@app.get("/api/v1/tasks")
async def list_tasks(user=Depends(get_current_user), scope: str = "all"):
    async with async_session() as session:
        query = select(Task)
        if scope == "assigned":
            query = query.where(Task.assignee_id == user.id)
        elif scope == "created":
            query = query.where(Task.creator_id == user.id)
        result = await session.execute(query.order_by(Task.created_at.desc()))
        tasks = result.scalars().all()
        return [{"id": t.id, "conversation_id": t.conversation_id, "creator_id": t.creator_id,
                 "assignee_id": t.assignee_id, "title": t.title, "description": t.description,
                 "status": t.status, "priority": t.priority, "due_date": t.due_date.isoformat() if t.due_date else None,
                 "created_at": t.created_at.isoformat()} for t in tasks]

@app.post("/api/v1/tasks")
async def create_task(payload: dict, user=Depends(get_current_user)):
    title = payload.get("title", "").strip()
    if not title:
        raise HTTPException(400, "任务标题不能为空")
    async with async_session() as session:
        task = Task(conversation_id=payload.get("conversation_id"), creator_id=user.id,
                    assignee_id=payload.get("assignee_id"), title=title,
                    description=payload.get("description", ""), priority=payload.get("priority", "normal"))
        session.add(task)
        await session.commit()
        await session.refresh(task)
        return {"id": task.id, "title": task.title, "status": task.status, "created_at": task.created_at.isoformat()}

@app.patch("/api/v1/tasks/{task_id}")
async def update_task(task_id: int, payload: dict, user=Depends(get_current_user)):
    async with async_session() as session:
        task = await session.get(Task, task_id)
        if not task:
            raise HTTPException(404, "任务不存在")
        for field in ["title", "description", "status", "priority", "assignee_id"]:
            if field in payload:
                setattr(task, field, payload[field])
        await session.commit()
        return {"ok": True}

# ========== 公告 API ==========
@app.get("/api/v1/announcements")
async def list_announcements(conversation_id: int = None):
    async with async_session() as session:
        query = select(Announcement).where(Announcement.is_global == True)
        if conversation_id:
            query = select(Announcement).where(Announcement.conversation_id == conversation_id)
        result = await session.execute(query.order_by(Announcement.created_at.desc()))
        anns = result.scalars().all()
        return [{"id": a.id, "conversation_id": a.conversation_id, "title": a.title, "content": a.content,
                 "is_global": a.is_global, "created_at": a.created_at.isoformat()} for a in anns]

@app.post("/api/v1/announcements")
async def create_announcement(payload: dict, user=Depends(get_current_user)):
    async with async_session() as session:
        ann = Announcement(conversation_id=payload.get("conversation_id"), author_id=user.id,
                           title=payload.get("title", ""), content=payload.get("content", ""),
                           is_global=payload.get("is_global", False))
        session.add(ann)
        await session.commit()
        await session.refresh(ann)
        return {"id": ann.id, "title": ann.title, "created_at": ann.created_at.isoformat()}

# ========== 收藏/精华 API ==========
@app.get("/api/v1/messages/bookmarks")
async def list_bookmarks(user=Depends(get_current_user)):
    async with async_session() as session:
        result = await session.execute(select(Bookmark).where(Bookmark.user_id == user.id).order_by(Bookmark.created_at.desc()))
        bookmarks = result.scalars().all()
        output = []
        for b in bookmarks:
            msg = await session.get(Message, b.message_id)
            if msg:
                sender = await session.get(User, msg.sender_id)
                output.append({"id": b.id, "message_id": b.message_id, "conversation_id": b.conversation_id,
                               "sender_name": sender.nickname if sender else "用户", "content": msg.content,
                               "created_at": msg.created_at.isoformat(), "bookmarked_at": b.created_at.isoformat()})
        return output

@app.post("/api/v1/messages/{message_id}/bookmark")
async def toggle_bookmark(message_id: int, user=Depends(get_current_user)):
    async with async_session() as session:
        msg = await session.get(Message, message_id)
        if not msg:
            raise HTTPException(404, "消息不存在")
        result = await session.execute(select(Bookmark).where(
            Bookmark.user_id == user.id, Bookmark.message_id == message_id))
        bookmark = result.scalar_one_or_none()
        if bookmark:
            await session.delete(bookmark)
            bookmarked = False
        else:
            session.add(Bookmark(user_id=user.id, message_id=message_id, conversation_id=msg.conversation_id))
            bookmarked = True
        await session.commit()
        return {"bookmarked": bookmarked}

# ========== 图片上传 API ==========
@app.post("/api/v1/uploads/image")
async def upload_image(file: UploadFile = File(...), user=Depends(get_current_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "只支持图片文件")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "图片不能超过5MB")
    ext = file.filename.split(".")[-1] if "." in file.filename else "png"
    filename = f"{secrets.token_hex(16)}.{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/{filename}", "filename": filename, "size": len(content)}

@app.get("/uploads/{filename}")
async def serve_upload(filename: str):
    filepath = os.path.join(os.path.dirname(__file__), "uploads", filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "文件不存在")
    return FileResponse(filepath)

# ========== 主页数据 API ==========
@app.get("/api/v1/home")
async def home_data(seed: int = 0, user=Depends(get_current_user)):
    async with async_session() as session:
        online = await session.execute(select(func.count(User.id)).where(User.status == "online"))
        total_users = await session.execute(select(func.count(User.id)))
        total_msgs = await session.execute(select(func.count(Message.id)))
        total_bots = await session.execute(select(func.count(Bot.id)).where(Bot.is_public == True))
        hot_groups = await session.execute(select(Conversation).where(Conversation.type == "group").order_by(Conversation.member_count.desc()).limit(6))
        groups = []
        for g in hot_groups.scalars().all():
            groups.append({"id": g.id, "title": g.title, "member_count": g.member_count or 0, "joined": False})
        return {"seed": seed, "online_count": online.scalar() or 0, "total_users": total_users.scalar() or 0,
                "total_messages": total_msgs.scalar() or 0, "total_bots": total_bots.scalar() or 0,
                "hot_groups": groups, "recommended_bots": [], "activities": []}

if __name__ == "__main__":
    import uvicorn
    import os
    cert = os.path.join(os.path.dirname(__file__), "cert.pem")
    key = os.path.join(os.path.dirname(__file__), "key.pem")
    if os.path.exists(cert) and os.path.exists(key):
        print("使用 HTTPS 模式启动")
        uvicorn.run(app, host="0.0.0.0", port=8000, ssl_keyfile=key, ssl_certfile=cert)
    else:
        print("使用 HTTP 模式启动（未找到证书）")
        uvicorn.run(app, host="0.0.0.0", port=8000)
