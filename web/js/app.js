// ========== JunjunChat 前端 v2.0 ==========
const CONFIG = {
  API_BASE: 'https://junjuncaht-production.up.railway.app/api/v1',
  WS_BASE: 'wss://junjuncaht-production.up.railway.app'
};

let token = localStorage.getItem('jj_token') || null;
let currentUser = null;
let ws = null;
let activeConv = null;
let convList = [];
let friendList = [];
let botList = [];
let currentListTab = 'conversations';
let theme = localStorage.getItem('jj_theme') || 'dark';
let adminToken = null;

// ========== 工具函数 ==========
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function avatarColor(name) {
  const c = ['#4aa8ff','#8b5cf6','#39e7ff','#ff5fd2','#4ecdc4','#ff6b6b','#ffd93d','#6bcb77','#ff9a3c','#c780fa'];
  let h=0; for(let i=0;i<(name||'?').length;i++) h=(name||'?').charCodeAt(i)+((h<<5)-h);
  return c[Math.abs(h)%c.length];
}
function avatarText(name) { return name ? name.trim().charAt(0).toUpperCase() : '?'; }
function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso), now = new Date();
    if (d.toDateString()===now.toDateString()) return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    return (d.getMonth()+1)+'/'+d.getDate()+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
  } catch(e) { return ''; }
}

// ========== API ==========
async function api(method, path, body) {
  const headers = {'Content-Type': 'application/json'};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = {method, headers};
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(CONFIG.API_BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e) { data = {detail: text}; }
  if (!res.ok) throw new Error(data.detail || data.message || ('HTTP ' + res.status));
  return data;
}

async function adminApi(method, path, body) {
  const headers = {'Content-Type': 'application/json'};
  if (adminToken) headers['Authorization'] = 'Bearer ' + adminToken;
  const opts = {method, headers};
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(CONFIG.API_BASE + path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e) { data = {detail: text}; }
  if (!res.ok) throw new Error(data.detail || 'HTTP ' + res.status);
  return data;
}

// ========== 主题 ==========
function applyTheme() {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('jj_theme', theme);
}

// ========== 登录注册 ==========
async function doLogin() {
  const u = $('#li-user').value.trim(), p = $('#li-pass').value;
  if (!u || !p) { $('#li-msg').textContent = '请输入用户名和密码'; return; }
  $('#li-msg').textContent = '';
  try {
    const data = await api('POST', '/auth/login', {username_or_email: u, password: p});
    token = data.access_token;
    currentUser = data.user;
    localStorage.setItem('jj_token', token);
    showMain();
  } catch(e) { $('#li-msg').textContent = e.message; }
}

async function doRegister() {
  const u = $('#re-user').value.trim(), n = $('#re-nick').value.trim(), p = $('#re-pass').value, p2 = $('#re-pass2').value;
  if (!u || !p) { $('#li-msg').textContent = '请填写用户名和密码'; return; }
  if (p !== p2) { $('#li-msg').textContent = '两次密码不一致'; return; }
  if (p.length < 6) { $('#li-msg').textContent = '密码至少6位'; return; }
  $('#li-msg').textContent = '';
  try {
    const data = await api('POST', '/auth/register', {username: u, password: p, nickname: n});
    token = data.access_token;
    currentUser = data.user;
    localStorage.setItem('jj_token', token);
    showMain();
  } catch(e) { $('#li-msg').textContent = e.message; }
}

function showMain() {
  $('#login-panel').style.display = 'none';
  $('#main-app').style.display = 'flex';
  $('#sidebar-avatar').textContent = avatarText(currentUser.nickname || currentUser.username);
  $('#sidebar-avatar').style.background = 'linear-gradient(135deg,' + avatarColor(currentUser.username) + ',' + avatarColor(currentUser.username+'x') + ')';
  $('#status-select').value = currentUser.status || 'online';
  loadConversations();
  loadFriends();
  loadBots();
  connectWS();
  renderEmojis();
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('jj_token');
  if (ws) ws.close();
  $('#main-app').style.display = 'none';
  $('#login-panel').style.display = 'flex';
  $('#li-user').value = ''; $('#li-pass').value = '';
}

// ========== WebSocket ==========
function connectWS() {
  if (!token) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(CONFIG.WS_BASE + '/ws?token=' + encodeURIComponent(token));
  } catch(e) { setTimeout(connectWS, 3000); return; }
  ws.onopen = () => { setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping'); }, 25000); };
  ws.onmessage = (evt) => {
    if (evt.data === 'pong') return;
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'message.created' && msg.data) {
        const d = msg.data;
        if (activeConv && String(activeConv.id) === String(d.conversation_id)) {
          appendMessage(d);
        }
        loadConversations();
      }
    } catch(e) {}
  };
  ws.onclose = () => { setTimeout(connectWS, 3000); };
  ws.onerror = () => { if (ws) ws.close(); };
}

// ========== 导航切换 ==========
function switchNav(nav) {
  $$('.nav-item[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === nav));
  ['chat', 'contacts', 'space', 'bots', 'settings'].forEach(p => {
    $('#panel-' + p).style.display = (p === nav) ? 'flex' : 'none';
  });
  if (nav === 'chat') loadConversations();
  if (nav === 'contacts') loadFriends();
  if (nav === 'bots') loadBots();
}

// ========== 聊天列表 ==========
async function loadConversations() {
  try {
    convList = await api('GET', '/conversations');
  } catch(e) { convList = []; }
  renderChatList();
}

async function loadFriends() {
  try {
    friendList = await api('GET', '/friends');
  } catch(e) { friendList = []; }
  renderChatList();
}

function renderChatList(filter) {
  const box = $('#chat-list');
  let list = [];
  if (currentListTab === 'conversations') {
    list = convList.map(c => ({...c, _type: 'conv'}));
  } else if (currentListTab === 'friends') {
    list = friendList.map(f => ({...f, _type: 'friend', title: f.nickname || f.username, id: f.id}));
  } else if (currentListTab === 'groups') {
    list = convList.filter(c => c.type === 'group').map(c => ({...c, _type: 'conv'}));
  }
  if (filter) list = list.filter(i => (i.title || '').toLowerCase().includes(filter.toLowerCase()));
  if (!list.length) {
    box.innerHTML = '<div class="empty-state" style="padding:40px 0"><div class="empty-icon">📭</div><p>暂无内容</p></div>';
    return;
  }
  box.innerHTML = list.map(item => {
    const isActive = activeConv && String(activeConv.id) === String(item.id);
    const lastMsg = item.last_message ? item.last_message.content : '';
    return `<div class="list-item ${isActive?'active':''}" data-id="${item.id}" data-type="${item._type}">
      <div class="avatar" style="background:linear-gradient(135deg,${avatarColor(item.title||'?')},${avatarColor((item.title||'?')+'x')})">${esc(avatarText(item.title||'?'))}</div>
      <div class="list-item-info">
        <div class="list-item-name">${esc(item.title||'会话')}</div>
        <div class="list-item-msg">${esc(lastMsg||(item._type==='friend'?'@'+item.username:'暂无消息'))}</div>
      </div>
      ${item.status?`<div class="status-dot ${item.status}"></div>`:''}
    </div>`;
  }).join('');
  box.querySelectorAll('.list-item').forEach(el => {
    el.onclick = () => openListItem(parseInt(el.dataset.id), el.dataset.type);
  });
}

async function openListItem(id, type) {
  if (type === 'friend') {
    try {
      const conv = await api('POST', '/conversations/direct', {user_id: id});
      await loadConversations();
      const c = convList.find(x => x.id === conv.id);
      if (c) openConversation(c);
    } catch(e) { alert(e.message); }
  } else {
    const c = convList.find(x => x.id === id);
    if (c) openConversation(c);
  }
}

async function openConversation(conv) {
  activeConv = conv;
  $('#chat-title').textContent = conv.title || '会话';
  $('#btn-group-info').style.display = conv.type === 'group' ? 'flex' : 'none';
  $('#messages-container').innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>加载中...</p></div>';
  try {
    const msgs = await api('GET', '/conversations/' + conv.id + '/messages?limit=50');
    renderMessages(msgs);
  } catch(e) {
    $('#messages-container').innerHTML = '<div class="empty-state"><div class="empty-icon">❌</div><p>加载失败</p></div>';
  }
  renderChatList();
}

function renderMessages(msgs) {
  const box = $('#messages-container');
  if (!msgs.length) {
    box.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><p>开始聊天吧</p></div>';
    return;
  }
  box.innerHTML = msgs.map(m => {
    const isMe = currentUser && String(m.sender_id) === String(currentUser.id);
    const sender = m.sender || {};
    const name = sender.nickname || sender.username || '用户';
    return `<div class="message ${isMe?'me':'other'}">
      <div class="message-avatar" style="background:linear-gradient(135deg,${avatarColor(name)},${avatarColor(name+'x')})">${esc(avatarText(name))}</div>
      <div class="message-body">
        ${!isMe?`<div class="message-sender">${esc(name)}</div>`:''}
        <div class="message-bubble">${esc(m.content)}</div>
        <div class="message-time">${formatTime(m.created_at)}</div>
      </div>
    </div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function appendMessage(msg) {
  const box = $('#messages-container');
  if (box.querySelector('.empty-state')) box.innerHTML = '';
  const isMe = currentUser && String(msg.sender_id) === String(currentUser.id);
  const sender = msg.sender || {};
  const name = sender.nickname || sender.username || '用户';
  const div = document.createElement('div');
  div.className = 'message ' + (isMe?'me':'other');
  div.innerHTML = `<div class="message-avatar" style="background:linear-gradient(135deg,${avatarColor(name)},${avatarColor(name+'x')})">${esc(avatarText(name))}</div>
    <div class="message-body">
      ${!isMe?`<div class="message-sender">${esc(name)}</div>`:''}
      <div class="message-bubble">${esc(msg.content)}</div>
      <div class="message-time">${formatTime(msg.created_at)}</div>
    </div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const input = $('#message-input');
  const content = input.value.trim();
  if (!content || !activeConv) return;
  input.value = '';
  try {
    const msg = await api('POST', '/conversations/' + activeConv.id + '/messages', {content});
    appendMessage(msg);
    loadConversations();
  } catch(e) { input.value = content; alert(e.message); }
}

// ========== 表情包 ==========
let emojiList = [];
async function loadEmojis() {
  try { emojiList = await api('GET', '/emojis'); } catch(e) { emojiList = []; }
}
function renderEmojis() {
  const panel = $('#emoji-panel');
  panel.innerHTML = emojiList.map(e => `<div class="emoji-item" title="${esc(e.name)}" data-char="${esc(e.char)}">${e.char}</div>`).join('');
  panel.querySelectorAll('.emoji-item').forEach(el => {
    el.onclick = () => { $('#message-input').value += el.dataset.char; };
  });
}

// ========== 机器人 ==========
async function loadBots() {
  try { botList = await api('GET', '/bots/mine'); } catch(e) { botList = []; }
  const box = $('#bots-list');
  if (!botList.length) {
    box.innerHTML = '<div class="empty-state" style="padding:40px 0"><div class="empty-icon">🤖</div><p>暂无机器人</p><p class="empty-sub">点右上角+创建</p></div>';
    return;
  }
  box.innerHTML = botList.map(b => `
    <div class="list-item" data-bot-id="${b.id}">
      <div class="avatar" style="background:linear-gradient(135deg,#8b5cf6,#4aa8ff)">B</div>
      <div class="list-item-info">
        <div class="list-item-name">${esc(b.name)}</div>
        <div class="list-item-msg">${b.is_online?'● 在线':'○ 离线'}</div>
      </div>
    </div>
  `).join('');
  box.querySelectorAll('.list-item').forEach(el => {
    el.onclick = () => showBotDetail(parseInt(el.dataset.botId));
  });
}

function showBotDetail(botId) {
  const bot = botList.find(b => b.id === botId);
  if (!bot) return;
  $('#bot-detail-panel').style.display = 'flex';
  $('#bot-detail-name').textContent = bot.name;
  const content = $('#bot-detail-content');
  content.innerHTML = `
    <div class="bot-info-card">
      <div class="bot-info-row"><span class="bot-info-label">机器人ID</span><span class="bot-info-value">${bot.id}</span></div>
      <div class="bot-info-row"><span class="bot-info-label">名称</span><span class="bot-info-value">${esc(bot.name)}</span></div>
      <div class="bot-info-row"><span class="bot-info-label">状态</span><span class="bot-info-value">${bot.is_online?'<span style="color:#4ecdc4">● 在线</span>':'<span style="color:#999">○ 离线</span>'}</span></div>
      <div class="bot-info-row"><span class="bot-info-label">最后活跃</span><span class="bot-info-value">${formatTime(bot.last_seen)}</span></div>
      <div style="margin-top:10px">
        <div class="bot-info-label" style="margin-bottom:4px">Bot Key (点击复制)</div>
        <div class="bot-key-box" onclick="navigator.clipboard.writeText(this.textContent)">${esc(bot.bot_key)}</div>
      </div>
    </div>
    <div class="api-section">
      <h4>📡 WebSocket 连接</h4>
      <div class="code-block">wss://localhost:8000/bot/ws?key=${esc(bot.bot_key)}</div>
    </div>
    <div class="api-section">
      <h4>📤 发送消息 (REST)</h4>
      <div class="code-block">POST /bot-api/conversations/{群ID}/messages
Header: Authorization: Bot ${esc(bot.bot_key)}
Body: {"message": "你好"}</div>
    </div>
    <div class="api-section">
      <h4>📥 接收消息 (WebSocket)</h4>
      <div class="code-block">连接后收到 JSON:
{
  "type": "message.created",
  "data": {
    "id": 1,
    "conversation_id": 1,
    "sender_id": 2,
    "content": "你好",
    "sender": {"username": "user", "nickname": "用户"}
  }
}</div>
    </div>
    <div class="api-section">
      <h4>🐍 Python 示例</h4>
      <div class="code-block">import websockets, json, asyncio
import requests

BOT_KEY = "${esc(bot.bot_key)}"
API = "https://localhost:8000"

async def listen():
    uri = f"wss://localhost:8000/bot/ws?key={BOT_KEY}"
    async with websockets.connect(uri) as ws:
        async for msg in ws:
            if msg == "pong": continue
            data = json.loads(msg)
            if data["type"] == "message.created":
                cid = data["data"]["conversation_id"]
                content = data["data"]["content"]
                # 回复消息
                requests.post(
                    f"{API}/bot-api/conversations/{cid}/messages",
                    headers={"Authorization": f"Bot {BOT_KEY}"},
                    json={"message": f"收到: {content}"},
                    verify=False
                )

asyncio.run(listen())</div>
    </div>
    <div class="api-section">
      <h4>📜 JavaScript 示例</h4>
      <div class="code-block">const BOT_KEY = "${esc(bot.bot_key)}";
const ws = new WebSocket(\`wss://localhost:8000/bot/ws?key=\${BOT_KEY}\`);

ws.onmessage = async (evt) => {
  if (evt.data === "pong") return;
  const msg = JSON.parse(evt.data);
  if (msg.type === "message.created") {
    const cid = msg.data.conversation_id;
    await fetch(\`https://localhost:8000/bot-api/conversations/\${cid}/messages\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bot \${BOT_KEY}\`
      },
      body: JSON.stringify({message: "收到: " + msg.data.content})
    });
  }
};</div>
    </div>
    <div class="api-section">
      <h4>🔧 群管理 API</h4>
      <div class="code-block">GET /bot-api/conversations/{id}     # 群信息
GET /bot-api/conversations/{id}/members  # 成员列表
GET /bot-api/conversations/{id}/messages # 历史消息
POST /bot-api/conversations/{id}/messages # 发消息
POST /bot-api/users/{id}/messages        # 发私信</div>
    </div>
  `;
}

// ========== 管理员 ==========
async function adminLogin() {
  const pass = $('#admin-pass').value;
  try {
    const data = await api('POST', '/admin/login', {password: pass});
    adminToken = data.access_token;
    $('#admin-panel').style.display = 'block';
    loadAdminStats();
    loadAdminUsers();
  } catch(e) { alert(e.message); }
}

async function loadAdminStats() {
  try {
    const s = await adminApi('GET', '/admin/stats');
    $('#admin-stats').innerHTML = `
      <div class="stat-card"><div class="stat-num">${s.users}</div><div class="stat-label">用户</div></div>
      <div class="stat-card"><div class="stat-num">${s.messages}</div><div class="stat-label">消息</div></div>
      <div class="stat-card"><div class="stat-num">${s.groups}</div><div class="stat-label">群聊</div></div>
      <div class="stat-card"><div class="stat-num">${s.online}</div><div class="stat-label">在线</div></div>
    `;
  } catch(e) {}
}

async function loadAdminUsers() {
  try {
    const users = await adminApi('GET', '/admin/users');
    $('#admin-users').innerHTML = users.map(u => `
      <div class="admin-user-item">
        <span>${esc(u.nickname||u.username)} ${u.is_admin?'<span style="color:#ffd93d">👑</span>':''}</span>
        <button class="glass-btn" onclick="deleteUser(${u.id})">删除</button>
      </div>
    `).join('');
  } catch(e) {}
}

async function deleteUser(uid) {
  if (!confirm('确定删除该用户？')) return;
  try {
    await adminApi('DELETE', '/admin/users/' + uid);
    loadAdminUsers();
    loadAdminStats();
  } catch(e) { alert(e.message); }
}

// ========== 弹窗 ==========
function showModal(title, bodyHTML, onOk) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  $('#modal').style.display = 'flex';
  $('#modal-ok').onclick = async () => {
    if (onOk) { const r = await onOk(); if (r !== false) closeModal(); }
    else closeModal();
  };
}
function closeModal() { $('#modal').style.display = 'none'; }

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadEmojis();

  // 登录注册
  $('#li-btn').onclick = doLogin;
  $('#li-pass').onkeydown = (e) => { if (e.key === 'Enter') doLogin(); };
  $('#re-btn').onclick = doRegister;
  $('#to-reg').onclick = () => { $('#login-form').style.display='none'; $('#reg-form').style.display='block'; $('#li-msg').textContent=''; };
  $('#to-login').onclick = () => { $('#login-form').style.display='block'; $('#reg-form').style.display='none'; $('#li-msg').textContent=''; };

  // 导航
  $$('.nav-item[data-nav]').forEach(el => el.onclick = () => switchNav(el.dataset.nav));

  // 聊天标签
  $$('.tab').forEach(el => el.onclick = () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    currentListTab = el.dataset.list;
    renderChatList();
  });

  // 搜索
  $('#search-input').oninput = (e) => renderChatList(e.target.value);

  // 发送消息
  $('#btn-send').onclick = sendMessage;
  $('#message-input').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // 表情
  $('#btn-emoji').onclick = () => {
    const p = $('#emoji-panel');
    p.style.display = p.style.display === 'none' ? 'grid' : 'none';
  };

  // 主题
  $('#theme-toggle').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); };
  $('#theme-btn').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); };

  // 状态
  $('#status-select').onchange = async (e) => {
    try { await api('PUT', '/users/me/status', {status: e.target.value}); } catch(err) {}
  };

  // 管理员
  $('#admin-login').onclick = adminLogin;

  // 添加好友
  $('#btn-add-friend').onclick = () => {
    showModal('添加好友', '<input id="m-search" class="glass-input" placeholder="输入用户名搜索"><div id="m-results" style="margin-top:10px;max-height:200px;overflow-y:auto;"></div>', null);
    $('#m-search').oninput = async (e) => {
      const q = e.target.value.trim();
      if (!q) { $('#m-results').innerHTML = ''; return; }
      try {
        const users = await api('GET', '/users/search?q=' + encodeURIComponent(q));
        $('#m-results').innerHTML = users.map(u => `
          <div class="list-item" style="border:none" onclick="addFriend(${u.id})">
            <div class="avatar" style="background:linear-gradient(135deg,${avatarColor(u.username)},${avatarColor(u.username+'x')})">${esc(avatarText(u.nickname||u.username))}</div>
            <div class="list-item-info"><div class="list-item-name">${esc(u.nickname||u.username)}</div><div class="list-item-msg">@${esc(u.username)}</div></div>
          </div>
        `).join('') || '<div style="text-align:center;color:#999;padding:20px">未找到用户</div>';
      } catch(err) { $('#m-results').innerHTML = '<div style="text-align:center;color:#999;padding:20px">搜索失败</div>'; }
    };
  };

  // 创建群聊
  $('#btn-add-chat').onclick = () => {
    showModal('发起聊天', '<div style="margin-bottom:10px"><div style="font-size:12px;color:#999;margin-bottom:4px">创建群聊</div><input id="m-gname" class="glass-input" placeholder="群聊名称"></div><div><div style="font-size:12px;color:#999;margin-bottom:4px">加入群聊</div><input id="m-gid" class="glass-input" placeholder="群聊ID"></div>', async () => {
      const name = $('#m-gname').value.trim();
      const gid = $('#m-gid').value.trim();
      try {
        if (name) { await api('POST', '/conversations/groups', {title: name, member_ids: []}); }
        else if (gid) { await api('POST', '/conversations/' + gid + '/join'); }
        loadConversations();
      } catch(e) { alert(e.message); return false; }
    });
  };

  // 创建机器人
  $('#btn-create-bot').onclick = () => {
    showModal('创建机器人', '<input id="m-bname" class="glass-input" placeholder="机器人名称"><input id="m-bdesc" class="glass-input" placeholder="描述（可选）" style="margin-top:8px">', async () => {
      const name = $('#m-bname').value.trim();
      const desc = $('#m-bdesc').value.trim();
      if (!name) { alert('请输入名称'); return false; }
      try { await api('POST', '/bots', {name, description: desc, is_public: false}); loadBots(); }
      catch(e) { alert(e.message); return false; }
    });
  };

  // 关闭机器人详情
  $('#btn-close-bot-detail').onclick = () => { $('#bot-detail-panel').style.display = 'none'; };

  // 弹窗关闭
  $('#modal-close').onclick = closeModal;
  $('#modal-cancel').onclick = closeModal;

  // 自动登录
  if (token) {
    api('GET', '/auth/me').then(u => { currentUser = u; showMain(); }).catch(() => { token = null; localStorage.removeItem('jj_token'); });
  }
});

// 全局函数（供HTML内联调用）
window.addFriend = async (uid) => {
  try { await api('POST', '/friends/requests', {receiver_id: uid}); alert('好友请求已发送'); closeModal(); }
  catch(e) { alert(e.message); }
};
window.deleteUser = deleteUser;
