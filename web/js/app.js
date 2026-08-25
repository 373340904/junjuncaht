/* ========== JunjunChat v3.0 ========== */
const CONFIG = {
  API_BASE: 'https://junjuncaht-production.up.railway.app/api/v1',
  WS_BASE: 'wss://junjuncaht-production.up.railway.app'
};
const EMOJIS = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','👽','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','👏','🙌','👐','🤲','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐓','🦃','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦦','🦥','🐁','🐀','🐿️','🦔','🐾','🦋','🐌','🐞','🐜','🦗','🕷️','🦂'];

let state = {
  token: localStorage.getItem('jj_token') || null,
  user: null,
  currentConv: null,
  currentNav: 'chat',
  currentList: 'conversations',
  currentContactCat: 'friends',
  currentBotTab: 'square',
  conversations: [],
  friends: [],
  requests: [],
  bots: [],
  messages: {},
  ws: null,
  wsReconnect: 0,
  tasks: JSON.parse(localStorage.getItem('jj_tasks') || '[]'),
  moments: []
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => { if(s==null)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
const avatarColor = (n) => { const c=['#4aa8ff','#8b5cf6','#39e7ff','#ff5fd2','#4ecdc4','#ff6b6b','#ffd93d','#6bcb77','#ff9a3c','#c780fa']; let h=0; for(let i=0;i<(n||'?').length;i++) h=(n||'?').charCodeAt(i)+((h<<5)-h); return c[Math.abs(h)%c.length]; };
const avatarText = (n) => (n||'?').trim().charAt(0).toUpperCase();
const fmtTime = (iso) => { if(!iso)return''; try{const d=new Date(iso),n=new Date(); if(d.toDateString()===n.toDateString())return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0'); return (d.getMonth()+1)+'/'+d.getDate()+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');}catch(e){return'';} };

async function api(method, path, body) {
  let headers = {'Content-Type':'application/json'};
  if(state.token) headers['Authorization']='Bearer '+state.token;
  const opts = {method, headers};
  if(body!==undefined) opts.body=JSON.stringify(body);
  const res = await fetch(CONFIG.API_BASE+path, opts);
  const text = await res.text();
  let data=null; try{data=text?JSON.parse(text):null;}catch(e){data={detail:text};}
  if(!res.ok) throw new Error((data&&(data.detail||data.message))||('HTTP '+res.status));
  return data;
}

/* ========== 初始化 ========== */
async function init() {
  // 主题
  const theme = localStorage.getItem('jj_theme')||'dark';
  document.documentElement.setAttribute('data-theme', theme);
  // 表情面板
  renderEmojis();
  // 事件绑定
  bindEvents();
  // 自动登录
  if(state.token) {
    try { const me = await api('GET','/auth/me'); state.user=me; showMain(); loadAll(); connectWS(); }
    catch(e) { state.token=null; localStorage.removeItem('jj_token'); showLogin(); }
  } else showLogin();
}

function bindEvents() {
  $('#li-btn').onclick = doLogin;
  $('#li-pass').onkeydown = e=>{ if(e.key==='Enter') doLogin(); };
  $('#to-reg').onclick = ()=>{ $('#login-form').style.display='none'; $('#reg-form').style.display='block'; $('#li-msg').textContent=''; };
  $('#to-login').onclick = ()=>{ $('#login-form').style.display='block'; $('#reg-form').style.display='none'; $('#li-msg').textContent=''; };
  $('#re-btn').onclick = doRegister;
  $$('.nav-item[data-nav]').forEach(n=>n.onclick=()=>switchNav(n.dataset.nav));
  $('#theme-toggle').onclick = toggleTheme;
  $('#theme-btn').onclick = toggleTheme;
  $('#notif-btn').onclick = ()=>switchNav('contacts');
  $('#sidebar-avatar').onclick = ()=>switchNav('settings');
  // 聊天
  $('#btn-send').onclick = sendMessage;
  $('#message-input').onkeydown = e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} };
  $('#btn-emoji').onclick = ()=>{ $('#emoji-panel').style.display=$('#emoji-panel').style.display==='none'?'grid':'none'; };
  // 列表
  $$('.tab').forEach(t=>t.onclick=()=>{ $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); state.currentList=t.dataset.list; renderChatList(); });
  $('#search-input').oninput = e=>renderChatList(e.target.value);
  $('#btn-add-chat').onclick = showNewChatModal;
  $('#btn-add-friend').onclick = showAddFriendModal;
  $('#btn-create-bot').onclick = showCreateBotModal;
  $('#btn-post-moment').onclick = showPostMomentModal;
  $('#btn-add-task').onclick = addTask;
  // 联系人分类
  $$('.contact-cat').forEach(c=>c.onclick=()=>{ $$('.contact-cat').forEach(x=>x.classList.remove('active')); c.classList.add('active'); state.currentContactCat=c.dataset.cat; renderContacts(); });
  // 机器人tab
  $$('.bot-tab').forEach(t=>t.onclick=()=>{ $$('.bot-tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); state.currentBotTab=t.dataset.bottab; renderBots(); });
  // 设置
  $('#btn-save-profile').onclick = saveProfile;
  $('#status-select').onchange = setStatus;
  $('#admin-login').onclick = adminLogin;
  $('#btn-logout').onclick = logout;
  // 群信息
  $('#btn-close-bot-detail').onclick = ()=>$('#bot-detail-panel').style.display='none';
  $('#btn-close-group-info').onclick = ()=>$('#group-info-panel').style.display='none';
  $('#btn-group-info').onclick = showGroupInfo;
  // 弹窗
  $('#modal-close').onclick = closeModal;
  $('#modal-cancel').onclick = closeModal;
}

/* ========== 登录注册 ========== */
function showLogin() { $('#login-panel').style.display='flex'; $('#main-app').style.display='none'; }
function showMain() { $('#login-panel').style.display='none'; $('#main-app').style.display='flex'; $('#sidebar-avatar').textContent=avatarText(state.user.nickname||state.user.username); $('#sidebar-avatar').style.background='linear-gradient(135deg,'+avatarColor(state.user.username)+','+avatarColor(state.user.username+'x')+')'; }

async function doLogin() {
  const u=$('#li-user').value.trim(), p=$('#li-pass').value;
  if(!u||!p){$('#li-msg').textContent='请输入用户名和密码';return;}
  $('#li-msg').textContent='';
  try {
    const d=await api('POST','/auth/login',{username_or_email:u,password:p,remember_me:true});
    state.token=d.access_token; state.user=d.user; localStorage.setItem('jj_token',d.access_token);
    showMain(); loadAll(); connectWS();
  } catch(e){ $('#li-msg').textContent=e.message; }
}
async function doRegister() {
  const u=$('#re-user').value.trim(),n=$('#re-nick').value.trim(),p=$('#re-pass').value,p2=$('#re-pass2').value;
  if(!u||!p){$('#li-msg').textContent='请填写用户名和密码';return;}
  if(p!==p2){$('#li-msg').textContent='两次密码不一致';return;}
  if(p.length<6){$('#li-msg').textContent='密码至少6位';return;}
  $('#li-msg').textContent='';
  try {
    const d=await api('POST','/auth/register',{username:u,password:p,nickname:n});
    state.token=d.access_token; state.user=d.user; localStorage.setItem('jj_token',d.access_token);
    showMain(); loadAll(); connectWS();
  } catch(e){ $('#li-msg').textContent=e.message; }
}
function logout() { state.token=null; state.user=null; localStorage.removeItem('jj_token'); if(state.ws)state.ws.close(); showLogin(); }

/* ========== 导航 ========== */
function switchNav(nav) {
  state.currentNav=nav;
  $$('.nav-item[data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===nav));
  ['chat','contacts','space','bots','tasks','files','favorites','settings'].forEach(n=>{
    $('#panel-'+n).style.display = n===nav?'flex':'none';
  });
  $('#chat-area').style.display = (nav==='chat')?'flex':'none';
  $('#bot-detail-panel').style.display='none';
  $('#group-info-panel').style.display='none';
  if(nav==='contacts') renderContacts();
  if(nav==='bots') loadBots();
  if(nav==='tasks') renderTasks();
  if(nav==='settings') loadSettings();
  if(nav==='space') renderMoments();
}

/* ========== 加载数据 ========== */
async function loadAll() {
  await Promise.all([loadConversations(), loadFriends(), loadRequests()]);
  renderChatList();
  updateCounts();
}
async function loadConversations() { try{state.conversations=await api('GET','/conversations');}catch(e){state.conversations=[];} }
async function loadFriends() { try{state.friends=await api('GET','/friends');}catch(e){state.friends=[];} }
async function loadRequests() { try{state.requests=await api('GET','/friends/requests/incoming');}catch(e){state.requests=[];} }
async function loadBots() { try{state.bots=await api('GET','/bots/mine');}catch(e){state.bots=[];} renderBots(); }

function updateCounts() {
  $('#friend-count').textContent=(state.friends||[]).length+' 位联系人';
  $('#request-count').textContent=(state.requests||[]).length+' 条待处理';
  $('#group-count').textContent=(state.conversations||[]).filter(c=>c.type==='group').length+' 个群聊';
  const rc=(state.requests||[]).length;
  $('#notif-badge').style.display=rc>0?'block':'none';
  $('#notif-badge').textContent=rc;
}

/* ========== 聊天列表 ========== */
function renderChatList(filter) {
  const box=$('#chat-list'); box.innerHTML='';
  let list=[];
  if(state.currentList==='conversations') list=state.conversations||[];
  else if(state.currentList==='friends') list=state.friends||[];
  else if(state.currentList==='groups') list=(state.conversations||[]).filter(c=>c.type==='group');
  if(filter) list=list.filter(c=>(c.title||c.nickname||c.username||'').toLowerCase().includes(filter.toLowerCase()));
  if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon">💬</div><p>暂无内容</p></div>';return;}
  list.forEach(c=>{
    const name=c.title||c.nickname||c.username||'会话';
    const last=c.last_message?c.last_message.content:(c.signature||'');
    const item=document.createElement('div');
    item.className='list-item'+(state.currentConv&&state.currentConv.id===c.id?' active':'');
    item.innerHTML='<div class="avatar" style="background:linear-gradient(135deg,'+avatarColor(name)+','+avatarColor(name+'x')+')">'+esc(avatarText(name))+'</div><div class="list-item-info"><div class="list-item-name">'+esc(name)+'</div><div class="list-item-msg">'+esc(last||'暂无消息')+'</div></div>'+(c.status?'<div class="status-dot '+c.status+'"></div>':'');
    item.onclick=()=>openConv(c);
    box.appendChild(item);
  });
}

/* ========== 打开会话 ========== */
async function openConv(conv) {
  // 如果是好友，创建/获取私聊
  if(conv.username) {
    try { conv=await api('POST','/conversations/direct',{user_id:conv.id}); await loadConversations(); }catch(e){return;}
  }
  state.currentConv=conv;
  $('#chat-title').textContent=conv.title||'会话';
  $('#btn-group-info').style.display=conv.type==='group'?'flex':'none';
  $('#messages-container').innerHTML='<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px">加载中...</div>';
  if(!state.messages[conv.id]) {
    try{state.messages[conv.id]=await api('GET','/conversations/'+conv.id+'/messages?limit=50');}catch(e){state.messages[conv.id]=[];}
  }
  renderMessages();
  renderChatList();
  // 群公告
  if(conv.type==='group'&&conv.announcement) {
    $('#group-announcement').style.display='block';
    $('#group-announcement').textContent='📢 '+conv.announcement;
  } else $('#group-announcement').style.display='none';
}

function renderMessages() {
  const box=$('#messages-container');
  if(!state.currentConv){box.innerHTML='<div class="empty-state"><div class="empty-icon">💬</div><p>选择一个会话开始聊天</p></div>';return;}
  const msgs=state.messages[state.currentConv.id]||[];
  if(!msgs.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">👋</div><p>开始聊天吧</p></div>';return;}
  box.innerHTML='';
  msgs.forEach(m=>{
    if(m.is_deleted) {
      const d=document.createElement('div'); d.className='msg-recall'; d.textContent='消息已撤回'; box.appendChild(d); return;
    }
    const isMe=state.user&&String(m.sender_id)===String(state.user.id);
    const sender=m.sender||{};
    const name=sender.nickname||sender.username||'用户';
    const row=document.createElement('div'); row.className='message'+(isMe?' me':' other');
    row.innerHTML='<div class="message-avatar" style="background:linear-gradient(135deg,'+avatarColor(name)+','+avatarColor(name+'x')+')">'+esc(avatarText(name))+'</div><div class="message-body">'+(!isMe?'<div class="message-sender">'+esc(name)+'</div>':'')+'<div class="message-bubble">'+esc(m.content)+'</div><div class="message-time">'+fmtTime(m.created_at)+'</div></div>';
    box.appendChild(row);
  });
  box.scrollTop=box.scrollHeight;
}

/* ========== 发送消息 ========== */
async function sendMessage() {
  const input=$('#message-input'); const content=input.value.trim();
  if(!content||!state.currentConv)return;
  input.value='';
  try {
    const msg=await api('POST','/conversations/'+state.currentConv.id+'/messages',{content});
    if(!state.messages[state.currentConv.id])state.messages[state.currentConv.id]=[];
    state.messages[state.currentConv.id].push(msg);
    renderMessages();
    await loadConversations(); renderChatList();
  } catch(e){ input.value=content; alert('发送失败: '+e.message); }
}

/* ========== 联系人 ========== */
function renderContacts() {
  const box=$('#contacts-list'); box.innerHTML='';
  if(state.currentContactCat==='friends') {
    const list=state.friends||[];
    if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon">👥</div><p>暂无好友</p><p class="empty-sub">点右上角+添加</p></div>';return;}
    list.forEach(f=>{
      const item=document.createElement('div'); item.className='list-item';
      item.innerHTML='<div class="avatar" style="background:linear-gradient(135deg,'+avatarColor(f.username)+','+avatarColor(f.username+'x')+')">'+esc(avatarText(f.nickname||f.username))+'</div><div class="list-item-info"><div class="list-item-name">'+esc(f.nickname||f.username)+'</div><div class="list-item-msg">@'+esc(f.username)+(f.signature?' · '+esc(f.signature):'')+'</div></div><div class="status-dot '+(f.status||'offline')+'"></div>';
      item.onclick=()=>openConv(f);
      box.appendChild(item);
    });
  } else if(state.currentContactCat==='requests') {
    const list=state.requests||[];
    if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon">🔔</div><p>暂无通知</p></div>';return;}
    list.forEach(r=>{
      const sender=r.sender||{};
      const card=document.createElement('div'); card.className='notif-card';
      card.innerHTML='<div class="avatar" style="background:linear-gradient(135deg,'+avatarColor(sender.username)+','+avatarColor(sender.username+'x')+')">'+esc(avatarText(sender.nickname||sender.username))+'</div><div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(sender.nickname||sender.username)+' 请求添加你为好友</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">'+fmtTime(r.created_at)+'</div></div><div class="notif-actions"><button class="glass-btn primary" style="padding:5px 14px;font-size:12px">接受</button><button class="glass-btn" style="padding:5px 14px;font-size:12px">拒绝</button></div>';
      card.querySelector('.glass-btn.primary').onclick=async()=>{try{await api('POST','/friends/requests/'+r.id+'/accept');await loadAll();renderContacts();}catch(e){alert(e.message);}};
      card.querySelectorAll('.glass-btn')[1].onclick=async()=>{try{await api('POST','/friends/requests/'+r.id+'/reject');await loadAll();renderContacts();}catch(e){alert(e.message);}};
      box.appendChild(card);
    });
  } else if(state.currentContactCat==='groups') {
    const list=(state.conversations||[]).filter(c=>c.type==='group');
    if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon">👨‍👩‍👧‍👦</div><p>暂无群聊</p></div>';return;}
    list.forEach(c=>{
      const item=document.createElement('div'); item.className='list-item';
      item.innerHTML='<div class="avatar" style="background:linear-gradient(135deg,'+avatarColor(c.title)+','+avatarColor(c.title+'x')+')">'+esc(avatarText(c.title))+'</div><div class="list-item-info"><div class="list-item-name">'+esc(c.title)+'</div><div class="list-item-msg">'+(c.member_count||0)+' 人</div></div>';
      item.onclick=()=>openConv(c);
      box.appendChild(item);
    });
  }
}

/* ========== 机器人 ========== */
function renderBots() {
  const grid=$('#bot-grid'); grid.innerHTML='';
  let list=state.bots||[];
  $('#stat-total').textContent=list.length;
  $('#stat-online').textContent=list.filter(b=>b.is_online).length;
  $('#stat-mine').textContent=list.length;
  if(!list.length){grid.innerHTML='<div class="empty-state" style="padding:40px;grid-column:1/-1"><div class="empty-icon">🤖</div><p>暂无机器人</p><p class="empty-sub">点右上角+创建</p></div>';return;}
  list.forEach(b=>{
    const card=document.createElement('div'); card.className='bot-card';
    card.innerHTML='<div class="bot-card-header"><div class="avatar" style="background:linear-gradient(135deg,#8b5cf6,#4aa8ff);width:36px;height:36px;font-size:13px">B</div><div style="flex:1"><div class="bot-card-name">'+esc(b.name)+'</div><div style="font-size:10px;color:var(--text-muted)">ID: '+b.id+'</div></div><span class="bot-online '+(b.is_online?'':'offline')+'">'+(b.is_online?'在线':'离线')+'</span></div><div class="bot-card-desc">'+esc(b.description||'暂无描述')+'</div><div class="bot-card-footer"><span style="font-size:10px;color:var(--text-muted)">'+esc(b.bot_key?'Key: '+b.bot_key.substring(0,12)+'...':'')+'</span><button class="glass-btn primary" style="padding:4px 12px;font-size:11px">详情</button></div>';
    card.querySelector('.glass-btn').onclick=(e)=>{e.stopPropagation();showBotDetail(b);};
    card.onclick=()=>showBotDetail(b);
    grid.appendChild(card);
  });
}

function showBotDetail(b) {
  $('#bot-detail-panel').style.display='flex';
  $('#bot-detail-name').textContent=b.name;
  const content=$('#bot-detail-content');
  content.innerHTML='<div class="bot-info-card"><div class="bot-info-row"><span class="bot-info-label">机器人ID</span><span class="bot-info-value">'+b.id+'</span></div><div class="bot-info-row"><span class="bot-info-label">名称</span><span class="bot-info-value">'+esc(b.name)+'</span></div><div class="bot-info-row"><span class="bot-info-label">状态</span><span class="bot-info-value">'+(b.is_online?'<span style="color:var(--success)">在线</span>':'<span style="color:var(--text-muted)">离线</span>')+'</span></div><div class="bot-info-row"><span class="bot-info-label">描述</span><span class="bot-info-value">'+esc(b.description||'无')+'</span></div></div><div class="bot-info-card"><div style="font-size:12px;font-weight:600;margin-bottom:8px">Bot Key（点击复制）</div><div class="bot-key-box" onclick="navigator.clipboard.writeText(this.textContent)">'+esc(b.bot_key)+'</div></div><div class="api-section"><h4>📡 WebSocket 连接</h4><div class="code-block">wss://junjuncaht-production.up.railway.app/bot/ws?key='+esc(b.bot_key)+'</div></div><div class="api-section"><h4>🐍 Python 示例</h4><div class="code-block">import websocket, json, requests\n\nBOT_KEY = "'+esc(b.bot_key)+'"\nAPI = "https://junjuncaht-production.up.railway.app/api/v1"\n\ndef on_message(ws, msg):\n    data = json.loads(msg)\n    if data["type"] == "message.created":\n        m = data["data"]\n        print(f"收到: {m[\'content\']}")\n        # 回复消息\n        requests.post(f"{API}/bot-api/conversations/{m[\'conversation_id\']}/messages",\n            headers={"Authorization": f"Bot {BOT_KEY}"},\n            json={"message": "收到！"})\n\nws = websocket.WebSocketApp(\n    f"wss://junjuncaht-production.up.railway.app/bot/ws?key={BOT_KEY}",\n    on_message=on_message)\nws.run_forever()</div></div><div class="api-section"><h4>📜 JavaScript 示例</h4><div class="code-block">const BOT_KEY = "'+esc(b.bot_key)+'";\nconst ws = new WebSocket(\n  `wss://junjuncaht-production.up.railway.app/bot/ws?key=${BOT_KEY}`\n);\nws.onmessage = (e) => {\n  const data = JSON.parse(e.data);\n  if (data.type === "message.created") {\n    const m = data.data;\n    fetch(`https://junjuncaht-production.up.railway.app/api/v1/bot-api/conversations/${m.conversation_id}/messages`, {\n      method: "POST",\n      headers: {"Authorization": `Bot ${BOT_KEY}`, "Content-Type": "application/json"},\n      body: JSON.stringify({message: "收到！"})\n    });\n  }\n};</div></div><div class="api-section"><h4>🔧 可用 API</h4><div class="code-block">GET  /bot-api/me                    获取机器人信息\nPOST /bot-api/conversations/:id/messages  发消息\nPOST /bot-api/users/:id/messages         发私信\nGET  /bot-api/conversations/:id          群信息\nGET  /bot-api/conversations/:id/members  群成员\nGET  /bot-api/conversations/:id/messages 历史消息</div></div>';
}

/* ========== 群信息 ========== */
async function showGroupInfo() {
  if(!state.currentConv||state.currentConv.type!=='group')return;
  $('#group-info-panel').style.display='flex';
  $('#group-info-title').textContent=state.currentConv.title;
  const content=$('#group-info-content');
  content.innerHTML='<div style="text-align:center;color:var(--text-muted);padding:20px">加载中...</div>';
  try {
    const conv=await api('GET','/conversations/'+state.currentConv.id);
    const members=await api('GET','/conversations/'+state.currentConv.id+'/members');
    content.innerHTML='<div class="bot-info-card"><div class="bot-info-row"><span class="bot-info-label">群ID</span><span class="bot-info-value">'+conv.id+'</span></div><div class="bot-info-row"><span class="bot-info-label">群名称</span><span class="bot-info-value">'+esc(conv.title)+'</span></div><div class="bot-info-row"><span class="bot-info-label">成员数</span><span class="bot-info-value">'+(members||[]).length+'</span></div><div class="bot-info-row"><span class="bot-info-label">群主</span><span class="bot-info-value">'+(conv.owner_id||'未知')+'</span></div></div><div style="font-size:13px;font-weight:600;margin:14px 0 8px">群成员</div><div id="group-members-list"></div>';
    const ml=$('#group-members-list');
    (members||[]).forEach(m=>{
      const isOwner=String(m.user_id)===String(conv.owner_id);
      const row=document.createElement('div'); row.className='member-item';
      row.innerHTML='<div class="avatar" style="width:30px;height:30px;font-size:11px;background:linear-gradient(135deg,'+avatarColor(m.username)+','+avatarColor(m.username+'x')+')">'+esc(avatarText(m.nickname||m.username))+'</div><div style="flex:1;font-size:12px">'+esc(m.nickname||m.username)+'</div><span class="member-role '+(isOwner?'owner':'')+'">'+(isOwner?'群主':'成员')+'</span>';
      ml.appendChild(row);
    });
  } catch(e){ content.innerHTML='<div style="color:var(--danger);padding:20px">加载失败: '+e.message+'</div>'; }
}

/* ========== 动态 ========== */
function renderMoments() {
  const box=$('#space-container'); box.innerHTML='';
  if(!state.moments.length){box.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon">📷</div><p>暂无动态</p><p class="empty-sub">点右上角✏️发布第一条动态</p></div>';return;}
  state.moments.forEach(m=>{
    const card=document.createElement('div'); card.className='moment-card';
    card.innerHTML='<div class="moment-header"><div class="avatar" style="width:36px;height:36px;font-size:13px;background:linear-gradient(135deg,'+avatarColor(m.author)+','+avatarColor(m.author+'x')+')">'+esc(avatarText(m.author))+'</div><div><div style="font-size:13px;font-weight:600">'+esc(m.author)+'</div><div style="font-size:10px;color:var(--text-muted)">'+fmtTime(m.time)+'</div></div></div><div class="moment-content">'+esc(m.content)+'</div>';
    box.appendChild(card);
  });
}

/* ========== 任务 ========== */
function renderTasks() {
  const box=$('#task-container'); box.innerHTML='';
  if(!state.tasks.length){box.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon">✅</div><p>暂无任务</p><p class="empty-sub">点右上角+添加</p></div>';return;}
  state.tasks.forEach((t,i)=>{
    const item=document.createElement('div'); item.className='task-item';
    item.innerHTML='<div class="task-check '+(t.done?'done':'')+'">'+(t.done?'✓':'')+'</div><div class="task-text '+(t.done?'done':'')+'">'+esc(t.text)+'</div><div class="task-del">×</div>';
    item.querySelector('.task-check').onclick=()=>{state.tasks[i].done=!state.tasks[i].done;localStorage.setItem('jj_tasks',JSON.stringify(state.tasks));renderTasks();};
    item.querySelector('.task-del').onclick=()=>{state.tasks.splice(i,1);localStorage.setItem('jj_tasks',JSON.stringify(state.tasks));renderTasks();};
    box.appendChild(item);
  });
}
function addTask() {
  const text=prompt('输入任务内容');
  if(!text)return;
  state.tasks.push({text,done:false});
  localStorage.setItem('jj_tasks',JSON.stringify(state.tasks));
  renderTasks();
}

/* ========== 设置 ========== */
function loadSettings() {
  $('#set-nick').value=state.user.nickname||'';
  $('#set-sign').value=state.user.signature||'';
  $('#status-select').value=state.user.status||'online';
}
async function saveProfile() {
  const nick=$('#set-nick').value.trim();
  const sign=$('#set-sign').value.trim();
  try {
    await api('PUT','/auth/profile',{nickname:nick,signature:sign});
    state.user.nickname=nick; state.user.signature=sign;
    $('#sidebar-avatar').textContent=avatarText(nick||state.user.username);
    alert('保存成功');
  } catch(e){ alert('保存失败: '+e.message); }
}
async function setStatus() {
  const s=$('#status-select').value;
  try { await api('PUT','/auth/status',{status:s}); state.user.status=s; }catch(e){}
}
let adminToken = null;
async function adminLogin() {
  const pass=$('#admin-pass').value;
  try {
    const d=await api('POST','/admin/login',{password:pass});
    adminToken=d.access_token;
    $('#admin-panel').style.display='block';
    await loadAdminData();
  } catch(e){ alert('密码错误或登录失败'); }
}
async function adminApi(method,path,body) {
  let headers={'Content-Type':'application/json'};
  if(adminToken) headers['Authorization']='Bearer '+adminToken;
  const opts={method,headers};
  if(body!==undefined) opts.body=JSON.stringify(body);
  const res=await fetch(CONFIG.API_BASE+path,opts);
  const text=await res.text();
  let data=null; try{data=text?JSON.parse(text):null;}catch(e){data={detail:text};}
  if(!res.ok) throw new Error((data&&(data.detail||data.message))||('HTTP '+res.status));
  return data;
}
async function loadAdminData() {
  try {
    const stats=await adminApi('GET','/admin/stats');
    $('#admin-stats').innerHTML='<div class="stat-card"><div class="stat-num">'+(stats.users||0)+'</div><div class="stat-label">用户</div></div><div class="stat-card"><div class="stat-num">'+(stats.messages||0)+'</div><div class="stat-label">消息</div></div><div class="stat-card"><div class="stat-num">'+(stats.groups||0)+'</div><div class="stat-label">群聊</div></div><div class="stat-card"><div class="stat-num">'+(stats.online||0)+'</div><div class="stat-label">在线</div></div>';
    const users=await adminApi('GET','/admin/users');
    $('#admin-users').innerHTML=(users||[]).map(u=>'<div class="admin-user-item"><span>'+esc(u.nickname||u.username)+' (@'+esc(u.username)+')</span><button class="glass-btn" onclick="deleteUser('+u.id+')">删除</button></div>').join('');
  } catch(e){ alert('加载失败: '+e.message); }
}
async function deleteUser(id) {
  if(!confirm('确定删除该用户？'))return;
  try{await adminApi('DELETE','/admin/users/'+id);await loadAdminData();}catch(e){alert(e.message);}
}

/* ========== 主题 ========== */
function toggleTheme() {
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('jj_theme',next);
}

/* ========== 表情 ========== */
function renderEmojis() {
  const box=$('#emoji-panel');
  EMOJIS.slice(0,120).forEach(e=>{
    const item=document.createElement('div'); item.className='emoji-item'; item.textContent=e;
    item.onclick=()=>{ $('#message-input').value+=e; $('#emoji-panel').style.display='none'; $('#message-input').focus(); };
    box.appendChild(item);
  });
}

/* ========== 弹窗 ========== */
function showModal(title, body, onOk) {
  $('#modal-title').textContent=title;
  $('#modal-body').innerHTML=body;
  $('#modal').style.display='flex';
  $('#modal-ok').onclick=async()=>{ if(onOk){const r=await onOk();if(r!==false)closeModal();}else closeModal(); };
}
function closeModal(){ $('#modal').style.display='none'; }

function showNewChatModal() {
  showModal('发起聊天','<div style="margin-bottom:10px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">创建群聊</div><input id="m-gname" class="glass-input" placeholder="群聊名称"></div><div><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">加入群聊</div><input id="m-gid" class="glass-input" placeholder="群聊ID"></div>',async()=>{
    const name=$('#m-gname').value.trim(); const gid=$('#m-gid').value.trim();
    try{
      if(name){const g=await api('POST','/conversations/groups',{title:name,member_ids:[]});await loadConversations();const c=state.conversations.find(x=>x.id===g.id);if(c)openConv(c);}
      else if(gid){await api('POST','/conversations/'+gid+'/join');await loadConversations();}
    }catch(e){alert(e.message);return false;}
  });
}
function showAddFriendModal() {
  showModal('添加好友','<input id="m-search" class="glass-input" placeholder="输入用户名或昵称搜索"><div id="m-results" style="max-height:200px;overflow-y:auto;margin-top:10px"></div>',null);
  $('#m-search').oninput=async(e)=>{
    const q=e.target.value.trim(); const box=$('#m-results');
    if(!q){box.innerHTML='';return;}
    try{
      const users=await api('GET','/users/search?q='+encodeURIComponent(q));
      box.innerHTML=users.map(u=>'<div class="list-item" style="border:none;cursor:pointer" onclick="sendFriendReq('+u.id+')"><div class="avatar" style="width:32px;height:32px;font-size:12px;background:linear-gradient(135deg,'+avatarColor(u.username)+','+avatarColor(u.username+'x')+')">'+esc(avatarText(u.nickname||u.username))+'</div><div style="flex:1"><div style="font-size:13px;font-weight:600">'+esc(u.nickname||u.username)+'</div><div style="font-size:11px;color:var(--text-muted)">@'+esc(u.username)+'</div></div></div>').join('');
    }catch(err){box.innerHTML='<div style="padding:10px;color:var(--text-muted);font-size:12px">未找到用户</div>';}
  };
}
async function sendFriendReq(id) {
  try{await api('POST','/friends/requests',{receiver_id:id});closeModal();alert('好友请求已发送');}catch(e){alert(e.message);}
}
function showCreateBotModal() {
  showModal('创建机器人','<input id="m-bname" class="glass-input" placeholder="机器人名称"><input id="m-bdesc" class="glass-input" placeholder="描述（可选）">',async()=>{
    const name=$('#m-bname').value.trim(); const desc=$('#m-bdesc').value.trim();
    if(!name){alert('请输入名称');return false;}
    try{await api('POST','/bots',{name,description:desc,is_public:false});await loadBots();}catch(e){alert(e.message);return false;}
  });
}
function showPostMomentModal() {
  showModal('发布动态','<textarea id="m-moment" class="glass-input" placeholder="说点什么..." style="height:100px;resize:none"></textarea>',async()=>{
    const content=$('#m-moment').value.trim();
    if(!content){alert('请输入内容');return false;}
    state.moments.unshift({author:state.user.nickname||state.user.username,content,time:new Date().toISOString()});
    renderMoments();
  });
}

/* ========== WebSocket ========== */
function connectWS() {
  if(!state.token)return;
  if(state.ws&&(state.ws.readyState===WebSocket.OPEN||state.ws.readyState===WebSocket.CONNECTING))return;
  try{state.ws=new WebSocket(CONFIG.WS_BASE+'/ws?token='+encodeURIComponent(state.token));}catch(e){scheduleWSReconnect();return;}
  state.ws.onopen=()=>{state.wsReconnect=0;};
  state.ws.onmessage=(e)=>{
    if(e.data==='pong')return;
    try{
      const msg=JSON.parse(e.data);
      if(msg.type==='message.created'&&msg.data){
        const d=msg.data;
        if(state.currentConv&&String(state.currentConv.id)===String(d.conversation_id)){
          if(!state.messages[d.conversation_id])state.messages[d.conversation_id]=[];
          state.messages[d.conversation_id].push(d);
          renderMessages();
        }
        loadConversations().then(()=>{renderChatList();if(state.currentNav==='contacts')renderContacts();});
      }
    }catch(e){}
  };
  state.ws.onclose=()=>scheduleWSReconnect();
  state.ws.onerror=()=>{if(state.ws)state.ws.close();};
}
function scheduleWSReconnect() {
  state.wsReconnect++;
  const delay=Math.min(1000*Math.pow(2,state.wsReconnect-1),30000);
  setTimeout(connectWS,delay);
}

/* ========== 启动 ========== */
init();
