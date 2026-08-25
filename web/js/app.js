/* ========== JunjunChat v5.0 ========== */
const API = 'https://junjuncaht-production.up.railway.app';
const EMOJIS = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','👽','🤖','🎃','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','💕','💞','💓','💗','💖','💘','💝','👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','👏','🙌','👐','🤲','🙏','✍️','💅','🤳','💪','🔥','⭐','🎉','🎊','🎁','🎈','💯','✅','❌','⚠️','❓','❗','💡','🔔','📢','💬','📱','💻','🎮','🎵','🎬','📚','✏️','📝','🔒','🔑','🏠','🚗','✈️','🌙','☀️','🌈','⭐','🌟','💫','⚡','🔥','💧','🌊','🌸','🌺','🌻','🌹','🌷','🍀','🌿','🌳','🌴','🌵','🍎','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥝','🍍','🥥','🍅','🥑','🥕','🌽','🥔','🍞','🧀','🥚','🍳','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥗','🍜','🍝','🍣','🍱','🥟','🍤','🍙','🍚','🍛','🍲','🥣','🍦','🍰','🎂','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🥛','☕','🍵','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧃','🥤','🧊','💊','🧪','🔬','🧫','🧬','🦠','🧹','🧺','🧻','🚽','🚿','🛁','🧴','🧷','🧹','🧺','🧻','🚽','🚿','🛁','🧴','🧷'];

let S = {
  token: localStorage.getItem('jj_token')||null,
  user: null, conv: null, nav: 'chat',
  convs: [], friends: [], requests: [], bots: [],
  messages: {}, ws: null, wsRetry: 0,
  tasks: JSON.parse(localStorage.getItem('jj_tasks')||'[]'),
  moments: [], adminToken: null, groupInfo: null,
  pollTimer: null, lastMsgId: 0
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const avC = n => {const c=['#007aff','#5856d6','#ff2d55','#ff9500','#34c759','#af52de','#ff3b30','#5ac8fa','#ffcc00','#8e8e93'];let h=0;for(let i=0;i<(n||'?').length;i++)h=(n||'?').charCodeAt(i)+((h<<5)-h);return c[Math.abs(h)%c.length]};
const avT = n => (n||'?').trim().charAt(0).toUpperCase();
const fmt = t => {if(!t)return'';try{const d=new Date(t),n=new Date();if(d.toDateString()===n.toDateString())return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');return (d.getMonth()+1)+'/'+d.getDate()+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');}catch(e){return''}};

async function api(m,p,b){
  const h={'Content-Type':'application/json'};
  if(S.token)h['Authorization']='Bearer '+S.token;
  const o={method:m,headers:h};
  if(b!==undefined)o.body=JSON.stringify(b);
  const r=await fetch(API+'/api/v1'+p,o);
  const tx=await r.text();let d=null;try{d=tx?JSON.parse(tx):null;}catch(e){d={detail:tx};}
  if(!r.ok)throw new Error((d&&(d.detail||d.message))||('HTTP '+r.status));
  return d;
}

/* ===== 初始化 ===== */
async function init(){
  const th=localStorage.getItem('jj_theme')||'light';
  document.documentElement.setAttribute('data-theme',th);
  renderEmojis();bind();
  // 不自动登录，显示登录页
  showLogin();
}

function bind(){
  $('#li-btn').onclick=doLogin;$('#li-pass').onkeydown=e=>{if(e.key==='Enter')doLogin();};
  $('#to-reg').onclick=()=>{$('#login-form').style.display='none';$('#reg-form').style.display='block';$('#li-msg').textContent='';};
  $('#to-login').onclick=()=>{$('#login-form').style.display='block';$('#reg-form').style.display='none';$('#li-msg').textContent='';};
  $('#re-btn').onclick=doRegister;
  $$('.nav-item[data-nav]').forEach(n=>n.onclick=()=>switchNav(n.dataset.nav));
  $('#theme-toggle').onclick=toggleTheme;$('#sidebar-avatar').onclick=()=>switchNav('settings');
  $('#btn-send').onclick=sendMsg;$('#message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}};
  $('#btn-emoji').onclick=()=>{$('#emoji-panel').style.display=$('#emoji-panel').style.display==='none'?'grid':'none';};
  $('#search-input').oninput=e=>renderConvList(e.target.value);
  $('#btn-add-chat').onclick=showNewChat;$('#btn-add-friend').onclick=showAddFriend;
  $('#btn-create-bot').onclick=showCreateBot;$('#btn-post-moment').onclick=showPostMoment;
  $('#btn-group-menu').onclick=e=>showGroupMenu(e);$('#btn-close-gs').onclick=()=>{$('#group-sidebar').style.display='none';};
  $('#modal-close').onclick=closeModal;$('#modal-cancel').onclick=closeModal;
  document.addEventListener('click',e=>{if(!e.target.closest('.context-menu'))hideContextMenu();if(!e.target.closest('.popup-menu'))hidePopup();if(!e.target.closest('.user-card')&&!e.target.closest('.avatar')&&!e.target.closest('.gs-member')&&!e.target.closest('.member-item'))hideUserCard();});
  document.addEventListener('contextmenu',e=>{const m=e.target.closest('.gs-member,.member-item');if(m){e.preventDefault();showMemberContext(e,m);}});
}

/* ===== 登录 ===== */
function showLogin(){$('#login-panel').style.display='flex';$('#main-app').style.display='none';}
function showMain(){$('#login-panel').style.display='none';$('#main-app').style.display='flex';$('#sidebar-avatar').textContent=avT(S.user.nickname||S.user.username);$('#sidebar-avatar').style.background='linear-gradient(135deg,'+avC(S.user.username)+','+avC(S.user.username+'x')+')';}
async function doLogin(){
  const u=$('#li-user').value.trim(),p=$('#li-pass').value;
  const remember=$('#li-remember').checked;
  if(!u||!p){$('#li-msg').textContent='请输入用户名和密码';return;}
  $('#li-msg').textContent='';
  try{
    if(S.ws){try{S.ws.close();}catch(e){}}
    S={...S,token:null,user:null,conv:null,convs:[],friends:[],requests:[],bots:[],messages:{},ws:null,groupInfo:null};
    localStorage.removeItem('jj_token');
    const d=await api('POST','/auth/login',{username_or_email:u,password:p,remember_me:remember});
    S.token=d.access_token;S.user=d.user;
    if(remember)localStorage.setItem('jj_token',d.access_token);
    showMain();loadAll();connectWS();startPolling();
  }catch(e){$('#li-msg').textContent=e.message;}
}
async function doRegister(){
  const u=$('#re-user').value.trim(),n=$('#re-nick').value.trim(),p=$('#re-pass').value,p2=$('#re-pass2').value;
  if(!u||!p){$('#li-msg').textContent='请填写用户名和密码';return;}
  if(p!==p2){$('#li-msg').textContent='两次密码不一致';return;}
  if(p.length<6){$('#li-msg').textContent='密码至少6位';return;}
  $('#li-msg').textContent='';
  try{
    if(S.ws){try{S.ws.close();}catch(e){}}
    S={...S,token:null,user:null,conv:null,convs:[],friends:[],requests:[],bots:[],messages:{},ws:null,groupInfo:null};
    localStorage.removeItem('jj_token');
    const d=await api('POST','/auth/register',{username:u,password:p,nickname:n});
    S.token=d.access_token;S.user=d.user;
    // 注册后不自动保存 token，下次需要手动登录
    showMain();loadAll();connectWS();startPolling();
  }catch(e){$('#li-msg').textContent=e.message;}
}
function logout(){
  if(S.ws){try{S.ws.close();}catch(e){}}
  stopPolling();
  S.token=null;S.user=null;S.conv=null;S.convs=[];S.friends=[];S.requests=[];S.bots=[];S.messages={};S.ws=null;S.groupInfo=null;
  localStorage.removeItem('jj_token');
  showLogin();
}

/* ===== 导航 ===== */
function switchNav(n){
  S.nav=n;
  $$('.nav-item[data-nav]').forEach(x=>x.classList.toggle('active',x.dataset.nav===n));
  $('#layout-chat').style.display=n==='chat'?'flex':'none';
  ['contacts','space','bots','settings'].forEach(x=>{$('#layout-'+x).style.display=x===n?'flex':'none';});
  $('#group-sidebar').style.display='none';
  if(n==='contacts')renderContacts();
  if(n==='bots')loadBots();
  if(n==='space')renderMoments();
  if(n==='settings')renderSettings();
}

/* ===== 加载 ===== */
async function loadAll(){await Promise.all([loadConvs(),loadFriends(),loadRequests()]);renderConvList();}
async function loadConvs(){try{S.convs=await api('GET','/conversations');}catch(e){S.convs=[];}}
async function loadFriends(){try{S.friends=await api('GET','/friends');}catch(e){S.friends=[];}}
async function loadRequests(){try{S.requests=await api('GET','/friends/requests/incoming');}catch(e){S.requests=[];}}
async function loadBots(){try{S.bots=await api('GET','/bots/mine');}catch(e){S.bots=[];}renderBots();}

/* ===== 会话列表 ===== */
function renderConvList(f){
  const box=$('#chat-list');box.innerHTML='';
  let list=S.convs||[];
  if(f)list=list.filter(c=>(c.title||'').toLowerCase().includes(f.toLowerCase()));
  if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px"><div class="empty-icon">💬</div><p>暂无会话</p></div>';return;}
  list.forEach((c,i)=>{
    const name=c.title||'会话',last=c.last_message?c.last_message.content:'';
    const el=document.createElement('div');el.className='list-item'+(S.conv&&S.conv.id===c.id?' active':'');el.style.animationDelay=(i*0.02)+'s';
    el.innerHTML='<div class="avatar" style="background:linear-gradient(135deg,'+avC(name)+','+avC(name+'x')+')">'+esc(avT(name))+'</div><div class="list-item-info"><div class="list-item-name">'+esc(name)+'</div><div class="list-item-msg">'+esc(last||'暂无消息')+'</div></div>'+(c.type==='group'?'<span style="font-size:10px;color:var(--text-3)">群</span>':'');
    el.onclick=()=>openConv(c);box.appendChild(el);
  });
}

/* ===== 打开会话 ===== */
async function openConv(c){
  if(c.username){try{c=await api('POST','/conversations/direct',{user_id:c.id});await loadConvs();}catch(e){return;}}
  S.conv=c;$('#chat-title').textContent=c.title||'会话';
  $('#btn-group-menu').style.display=c.type==='group'?'flex':'none';
  $('#messages-container').innerHTML='<div style="text-align:center;color:var(--text-2);padding:20px;font-size:13px">加载中...</div>';
  if(!S.messages[c.id]){try{S.messages[c.id]=await api('GET','/conversations/'+c.id+'/messages?limit=50');}catch(e){S.messages[c.id]=[];}}
  renderMsgs();renderConvList();
  if(c.type==='group')loadGroupInfo(c.id);
  else $('#group-sidebar').style.display='none';
  if(c.announcement){$('#group-announcement').style.display='block';$('#group-announcement').textContent='📢 '+c.announcement;}else $('#group-announcement').style.display='none';
}

async function loadGroupInfo(id){
  try{S.groupInfo=await api('GET','/conversations/'+id);$('#group-sidebar').style.display='flex';renderGroupSidebar();}catch(e){}
}

function renderGroupSidebar(){
  const g=S.groupInfo;if(!g)return;
  const box=$('#gs-content');
  const isOwner=String(g.owner_id)===String(S.user.id);
  const myRole=g.members.find(m=>String(m.id)===String(S.user.id))?.role||'member';
  const canManage=isOwner||myRole==='admin';
  box.innerHTML='<div class="gs-section"><div class="gs-avatar" style="background:linear-gradient(135deg,'+avC(g.title)+','+avC(g.title+'x')+')">'+esc(avT(g.title))+'</div><div class="gs-name">'+esc(g.title)+'</div><div class="gs-id">群ID: '+g.id+' · '+g.member_count+' 人</div></div>'+
    '<div class="gs-section"><div class="gs-section-title">群公告</div><div class="gs-announcement">'+esc(g.announcement||'暂无公告')+'</div>'+(canManage?'<button class="gs-btn" style="margin-top:8px" onclick="editAnnouncement()">编辑公告</button>':'')+'</div>'+
    '<div class="gs-section"><div class="gs-section-title">群成员 ('+g.members.length+')</div>'+g.members.map(m=>'<div class="gs-member" onclick="showUserCard('+m.id+')"><div class="avatar" style="width:32px;height:32px;font-size:12px;background:linear-gradient(135deg,'+avC(m.username)+','+avC(m.username+'x')+')">'+esc(avT(m.nickname||m.username))+'</div><div class="gs-member-name">'+esc(m.nickname||m.username)+'</div>'+(m.role==='owner'?'<span class="gs-role owner">群主</span>':m.role==='admin'?'<span class="gs-role admin">管理员</span>':'')+'</div>').join('')+'</div>'+
    '<div class="gs-section">'+(canManage?'<button class="gs-btn" onclick="showGroupMembersManage()">成员管理</button>':'')+'<button class="gs-btn" onclick="leaveGroup()">退出群聊</button>'+(isOwner?'<button class="gs-btn danger" onclick="dissolveGroup()">解散群聊</button>':'')+'</div>';
}

function renderMsgs(){
  const box=$('#messages-container');
  if(!S.conv){box.innerHTML='<div class="empty-state"><div class="empty-icon">💬</div><p>选择一个会话开始聊天</p></div>';return;}
  const msgs=S.messages[S.conv.id]||[];
  if(!msgs.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">👋</div><p>开始聊天吧</p></div>';return;}
  box.innerHTML='';
  msgs.forEach(m=>{
    const me=S.user&&String(m.sender_id)===String(S.user.id);
    const s=m.sender||{},name=s.nickname||s.username||'用户';
    const el=document.createElement('div');el.className='message'+(me?' me':' other');
    el.innerHTML='<div class="message-avatar" style="background:linear-gradient(135deg,'+avC(name)+','+avC(name+'x')+')">'+esc(avT(name))+'</div><div class="message-body">'+(!me?'<div class="message-sender">'+esc(name)+'</div>':'')+'<div class="message-bubble">'+esc(m.content)+'</div><div class="message-time">'+fmt(m.created_at)+'</div></div>';
    box.appendChild(el);
  });
  box.scrollTop=box.scrollHeight;
}

async function sendMsg(){
  const inp=$('#message-input'),c=inp.value.trim();
  if(!c||!S.conv)return;inp.value='';
  try{const m=await api('POST','/conversations/'+S.conv.id+'/messages',{content:c});if(!S.messages[S.conv.id])S.messages[S.conv.id]=[];S.messages[S.conv.id].push(m);renderMsgs();await loadConvs();renderConvList();}catch(e){inp.value=c;alert('发送失败: '+e.message);}
}

/* ===== 联系人 ===== */
function renderContacts(){
  const box=$('#contacts-content');box.innerHTML='';
  // 好友请求
  if(S.requests.length){
    box.innerHTML+='<div style="margin-bottom:20px"><h3 style="font-size:13px;color:var(--text-2);margin-bottom:10px;font-weight:600">好友请求 ('+S.requests.length+')</h3>'+S.requests.map(r=>{const s=r.sender||{};return '<div class="notif-card"><div class="avatar" style="width:36px;height:36px;font-size:13px;background:linear-gradient(135deg,'+avC(s.username)+','+avC(s.username+'x')+')">'+esc(avT(s.nickname||s.username))+'</div><div style="flex:1"><div style="font-size:14px;font-weight:600">'+esc(s.nickname||s.username)+' 请求添加好友</div><div style="font-size:11px;color:var(--text-2);margin-top:2px">'+fmt(r.created_at)+'</div></div><div class="notif-actions"><button class="glass-btn primary" style="padding:6px 14px;font-size:12px" onclick="acceptReq('+r.id+')">接受</button><button class="glass-btn" style="padding:6px 14px;font-size:12px" onclick="rejectReq('+r.id+')">拒绝</button></div></div>';}).join('')+'</div>';
  }
  // 好友列表
  box.innerHTML+='<h3 style="font-size:13px;color:var(--text-2);margin-bottom:10px;font-weight:600">我的好友 ('+(S.friends||[]).length+')</h3>';
  if(!S.friends.length){box.innerHTML+='<div class="empty-state" style="padding:30px"><div class="empty-icon">👥</div><p>暂无好友</p></div>';return;}
  const grid=document.createElement('div');grid.className='card-grid';
  S.friends.forEach((f,i)=>{
    const c=document.createElement('div');c.className='card';c.style.animationDelay=(i*0.03)+'s';
    c.innerHTML='<div class="card-header"><div class="avatar" style="background:linear-gradient(135deg,'+avC(f.username)+','+avC(f.username+'x')+')">'+esc(avT(f.nickname||f.username))+'</div><div><div class="card-title">'+esc(f.nickname||f.username)+'</div><div style="font-size:11px;color:var(--text-2)">@'+esc(f.username)+'</div></div><div class="status-dot '+(f.status||'offline')+'"></div></div><div class="card-desc">'+esc(f.signature||'这个人很懒，什么都没写')+'</div><div class="card-footer"><span style="font-size:11px;color:var(--text-2)">'+(f.status==='online'?'在线':f.status==='away'?'离开':f.status==='busy'?'忙碌':'离线')+'</span><button class="glass-btn primary" style="padding:6px 14px;font-size:12px">发消息</button></div>';
    c.querySelector('.glass-btn').onclick=()=>openConv(f);c.onclick=()=>openConv(f);
    grid.appendChild(c);
  });
  box.appendChild(grid);
}
async function acceptReq(id){try{await api('POST','/friends/requests/'+id+'/accept');await loadAll();renderContacts();}catch(e){alert(e.message);}}
async function rejectReq(id){try{await api('POST','/friends/requests/'+id+'/reject');await loadAll();renderContacts();}catch(e){alert(e.message);}}

/* ===== 机器人 ===== */
function renderBots(){
  const box=$('#bots-content');box.innerHTML='';
  if(!S.bots.length){box.innerHTML='<div class="empty-state" style="padding:60px"><div class="empty-icon">🤖</div><p>暂无机器人</p><p style="font-size:12px;margin-top:4px">点右上角+创建</p></div>';return;}
  const grid=document.createElement('div');grid.className='card-grid';
  S.bots.forEach((b,i)=>{
    const c=document.createElement('div');c.className='card';c.style.animationDelay=(i*0.03)+'s';
    c.innerHTML='<div class="card-header"><div class="avatar" style="background:linear-gradient(135deg,var(--purple),var(--accent))">B</div><div><div class="card-title">'+esc(b.name)+'</div><div style="font-size:11px;color:var(--text-2)">ID: '+b.id+'</div></div><span class="badge '+(b.is_online?'online':'offline')+'">'+(b.is_online?'在线':'离线')+'</span></div><div class="card-desc">'+esc(b.description||'暂无描述')+'</div><div class="card-footer"><span style="font-size:10px;color:var(--text-3);font-family:monospace">'+esc((b.bot_key||'').substring(0,16))+'...</span><button class="glass-btn primary" style="padding:6px 14px;font-size:12px">详情</button></div>';
    c.querySelector('.glass-btn').onclick=()=>showBotDetail(b);c.onclick=()=>showBotDetail(b);
    grid.appendChild(c);
  });
  box.appendChild(grid);
}
function showBotDetail(b){
  showModal('机器人: '+b.name,'<div style="margin-bottom:14px"><div style="font-size:12px;color:var(--text-2);margin-bottom:6px">Bot Key（点击复制）</div><div class="bot-key-box" onclick="navigator.clipboard.writeText(this.textContent)">'+esc(b.bot_key)+'</div></div><div style="margin-bottom:14px"><div style="font-size:12px;color:var(--text-2);margin-bottom:6px">WebSocket</div><div class="code-block">wss://junjuncaht-production.up.railway.app/bot/ws?key='+esc(b.bot_key)+'</div></div><div><div style="font-size:12px;color:var(--text-2);margin-bottom:6px">Python 示例</div><div class="code-block">import websocket, json, requests\nKEY="'+esc(b.bot_key)+'"\ndef on_msg(ws,msg):\n  d=json.loads(msg)\n  if d["type"]=="message.created":\n    m=d["data"]\n    requests.post(f"https://junjuncaht-production.up.railway.app/bot-api/conversations/{m[\'conversation_id\']}/messages",headers={"Authorization":f"Bot {KEY}"},json={"message":"收到！"})\nws=websocket.WebSocketApp(f"wss://junjuncaht-production.up.railway.app/bot/ws?key={KEY}",on_message=on_msg)\nws.run_forever()</div></div>',null);
}

/* ===== 动态 ===== */
function renderMoments(){
  const box=$('#space-container');box.innerHTML='';
  if(!S.moments.length){box.innerHTML='<div class="empty-state" style="padding:60px"><div class="empty-icon">📷</div><p>暂无动态</p><p style="font-size:12px;margin-top:4px">点右上角✏️发布</p></div>';return;}
  S.moments.forEach((m,i)=>{
    const c=document.createElement('div');c.className='moment-card';c.style.animationDelay=(i*0.05)+'s';
    c.innerHTML='<div class="moment-header"><div class="avatar" style="width:40px;height:40px;font-size:15px;background:linear-gradient(135deg,'+avC(m.author)+','+avC(m.author+'x')+')">'+esc(avT(m.author))+'</div><div><div style="font-size:14px;font-weight:600">'+esc(m.author)+'</div><div style="font-size:11px;color:var(--text-2)">'+fmt(m.time)+'</div></div></div><div class="moment-content">'+esc(m.content)+'</div>';
    box.appendChild(c);
  });
}

/* ===== 设置 ===== */
function renderSettings(){
  const box=$('#settings-content');
  box.innerHTML='<div class="setting-section"><h3>个人资料</h3><div class="setting-item"><span>昵称</span><input id="set-nick" class="glass-input" value="'+esc(S.user.nickname||'')+'"></div><div class="setting-item"><span>个性签名</span><input id="set-sign" class="glass-input" value="'+esc(S.user.signature||'')+'"></div><div class="setting-item"><span>状态</span><select id="set-status" class="glass-input"><option value="online">在线</option><option value="away">离开</option><option value="busy">忙碌</option><option value="offline">隐身</option></select></div><div class="setting-item"><span>头像字符</span><input id="set-avatar" class="glass-input" maxlength="2" value="'+esc(S.user.avatar||'')+'"></div><button class="glass-btn primary" style="width:100%;margin:10px 0" onclick="saveProfile()">保存</button></div>'+
    '<div class="setting-section"><h3>外观</h3><div class="setting-item"><span>深色模式</span><button class="glass-btn" onclick="toggleTheme()">切换</button></div></div>'+
    '<div class="setting-section"><h3>管理员</h3><div class="setting-item"><input id="admin-pass" type="password" class="glass-input" placeholder="管理员密码"><button class="glass-btn primary" onclick="adminLogin()">进入</button></div><div id="admin-panel" style="display:none;padding:10px 0"></div></div>'+
    '<div class="setting-section"><h3>账号</h3><button class="glass-btn danger" style="width:100%" onclick="logout()">退出登录</button></div>';
  $('#set-status').value=S.user.status||'online';
}
async function saveProfile(){
  try{await api('PUT','/auth/profile',{nickname:$('#set-nick').value.trim(),signature:$('#set-sign').value.trim()});if($('#set-avatar').value)await api('PUT','/auth/avatar',{avatar:$('#set-avatar').value});S.user.nickname=$('#set-nick').value.trim();S.user.signature=$('#set-sign').value.trim();$('#sidebar-avatar').textContent=avT(S.user.nickname||S.user.username);alert('保存成功');}catch(e){alert('保存失败: '+e.message);}
}
async function adminLogin(){
  try{const d=await api('POST','/admin/login',{password:$('#admin-pass').value});S.adminToken=d.access_token;const stats=await adminApi('GET','/admin/stats');const users=await adminApi('GET','/admin/users');$('#admin-panel').style.display='block';$('#admin-panel').innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'+['用户','消息','群聊','在线'].map((l,i)=>'<div style="background:var(--bg);border-radius:10px;padding:14px;text-align:center"><div style="font-size:22px;font-weight:700;color:var(--accent)">'+[stats.users,stats.messages,stats.groups,stats.online][i]+'</div><div style="font-size:11px;color:var(--text-2)">'+l+'</div></div>').join('')+'</div>'+users.map(u=>'<div class="setting-item"><span>'+esc(u.nickname||u.username)+' (@'+esc(u.username)+')</span><button class="glass-btn danger" style="padding:5px 12px;font-size:11px" onclick="delUser('+u.id+')">删除</button></div>').join('');}catch(e){alert('密码错误');}
}
async function adminApi(m,p,b){const h={'Content-Type':'application/json','Authorization':'Bearer '+S.adminToken};const o={method:m,headers:h};if(b)o.body=JSON.stringify(b);const r=await fetch(API+'/api/v1'+p,o);return r.json();}
async function delUser(id){if(!confirm('确定删除？'))return;try{await adminApi('DELETE','/admin/users/'+id);adminLogin();}catch(e){alert(e.message);}}

/* ===== 群管理 ===== */
function showGroupMenu(e){
  e.stopPropagation();
  if(!S.conv||S.conv.type!=='group')return;
  if(!S.groupInfo){loadGroupInfo(S.conv.id).then(()=>showGroupMenu(e));return;}
  const g=S.groupInfo;
  const isOwner=String(g.owner_id)===String(S.user.id);
  const myRole=g.members.find(m=>String(m.id)===String(S.user.id))?.role||'member';
  const canManage=isOwner||myRole==='admin';
  let items='<div class="context-menu-item" onclick="loadGroupInfo('+g.id+');hidePopup()">群信息</div>';
  if(canManage)items+='<div class="context-menu-item" onclick="editGroupName()">修改群名</div><div class="context-menu-item" onclick="editAnnouncement()">发布公告</div>';
  if(isOwner)items+='<div class="context-menu-item" onclick="showGroupMembersManage()">成员管理</div><div class="context-menu-divider"></div><div class="context-menu-item danger" onclick="dissolveGroup()">解散群聊</div>';
  else items+='<div class="context-menu-divider"></div><div class="context-menu-item danger" onclick="leaveGroup()">退出群聊</div>';
  showPopup(e,items);
}
async function editGroupName(){
  const name=prompt('输入新群名',S.groupInfo.title);if(!name)return;
  try{await api('PUT','/conversations/'+S.groupInfo.id,{title:name});S.groupInfo.title=name;$('#chat-title').textContent=name;renderGroupSidebar();await loadConvs();renderConvList();}catch(e){alert(e.message);}
}
async function editAnnouncement(){
  const a=prompt('输入群公告',S.groupInfo.announcement||'');if(a===null)return;
  try{await api('PUT','/conversations/'+S.groupInfo.id,{announcement:a});S.groupInfo.announcement=a;renderGroupSidebar();$('#group-announcement').style.display=a?'block':'none';$('#group-announcement').textContent='📢 '+a;}catch(e){alert(e.message);}
}
async function leaveGroup(){if(!confirm('确定退出群聊？'))return;try{await api('POST','/conversations/'+S.groupInfo.id+'/leave');S.conv=null;S.groupInfo=null;$('#group-sidebar').style.display='none';await loadConvs();renderConvList();$('#messages-container').innerHTML='<div class="empty-state"><div class="empty-icon">💬</div><p>选择一个会话开始聊天</p></div>';}catch(e){alert(e.message);}}
async function dissolveGroup(){if(!confirm('确定解散群聊？此操作不可恢复！'))return;try{await api('DELETE','/conversations/'+S.groupInfo.id);S.conv=null;S.groupInfo=null;$('#group-sidebar').style.display='none';await loadConvs();renderConvList();$('#messages-container').innerHTML='<div class="empty-state"><div class="empty-icon">💬</div><p>选择一个会话开始聊天</p></div>';}catch(e){alert(e.message);}}
function showGroupMembersManage(){
  const g=S.groupInfo;if(!g)return;
  const isOwner=String(g.owner_id)===String(S.user.id);
  showModal('成员管理',g.members.map(m=>'<div class="setting-item"><div style="display:flex;align-items:center;gap:8px"><div class="avatar" style="width:28px;height:28px;font-size:11px;background:linear-gradient(135deg,'+avC(m.username)+','+avC(m.username+'x')+')">'+esc(avT(m.nickname||m.username))+'</div><span>'+esc(m.nickname||m.username)+'</span>'+(m.role==='owner'?'<span class="gs-role owner">群主</span>':m.role==='admin'?'<span class="gs-role admin">管理员</span>':'')+'</div><div>'+(isOwner&&m.role!=='owner'?'<button class="glass-btn" style="padding:4px 10px;font-size:11px" onclick="toggleAdmin('+m.id+',\''+(m.role==='admin'?'member':'admin')+'\')">'+(m.role==='admin'?'取消管理员':'设为管理员')+'</button> ':'')+(m.role!=='owner'?'<button class="glass-btn" style="padding:4px 10px;font-size:11px" onclick="muteUser('+m.id+')">禁言</button> <button class="glass-btn danger" style="padding:4px 10px;font-size:11px" onclick="kickUser('+m.id+')">踢除</button>':'')+'</div></div>').join(''),null);
}
async function toggleAdmin(uid,role){try{await api('POST','/conversations/'+S.groupInfo.id+'/role',{user_id:uid,role});closeModal();await loadGroupInfo(S.groupInfo.id);showGroupMembersManage();}catch(e){alert(e.message);}}
async function muteUser(uid){const m=prompt('禁言分钟数（0=解除）','10');if(m===null)return;try{await api('POST','/conversations/'+S.groupInfo.id+'/mute',{user_id:uid,duration_minutes:parseInt(m)||0});alert('操作成功');}catch(e){alert(e.message);}}
async function kickUser(uid){if(!confirm('确定踢除该用户？'))return;try{await api('POST','/conversations/'+S.groupInfo.id+'/kick',{user_id:uid});closeModal();await loadGroupInfo(S.groupInfo.id);}catch(e){alert(e.message);}}

/* ===== 右键菜单 ===== */
function showMemberContext(e,el){
  const uid=el.getAttribute('onclick')?.match(/\d+/)?.[0];if(!uid)return;
  const g=S.groupInfo;if(!g)return;
  const member=g.members.find(m=>String(m.id)===uid);if(!member)return;
  const isOwner=String(g.owner_id)===String(S.user.id);
  const myRole=g.members.find(m=>String(m.id)===String(S.user.id))?.role||'member';
  const canManage=isOwner||myRole==='admin';
  let items='<div class="context-menu-item" onclick="showUserCard('+uid+');hideContextMenu()">查看资料</div>';
  if(canManage&&member.role!=='owner'){
    if(isOwner)items+='<div class="context-menu-item" onclick="toggleAdmin('+uid+',\''+(member.role==='admin'?'member':'admin')+'\');hideContextMenu()">'+(member.role==='admin'?'取消管理员':'设为管理员')+'</div>';
    items+='<div class="context-menu-item" onclick="muteUser('+uid+');hideContextMenu()">禁言</div><div class="context-menu-item danger" onclick="kickUser('+uid+');hideContextMenu()">踢除</div>';
  }
  showContextMenu(e,items);
}
function showContextMenu(e,html){
  const m=$('#context-menu');m.innerHTML=html;m.style.display='block';
  m.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';m.style.top=Math.min(e.clientY,window.innerHeight-300)+'px';
}
function hideContextMenu(){$('#context-menu').style.display='none';}
function showPopup(e,html){
  const m=$('#group-menu-popup');m.innerHTML=html;m.style.display='block';
  const r=e.target.getBoundingClientRect();m.style.left=(r.right-200)+'px';m.style.top=(r.bottom+5)+'px';
}
function hidePopup(){$('#group-menu-popup').style.display='none';}

/* ===== 用户名片 ===== */
async function showUserCard(uid){
  try{
    const u=await api('GET','/users/'+uid+'/profile');
    const c=$('#user-card-content');
    c.innerHTML='<div class="uc-avatar" style="background:linear-gradient(135deg,'+avC(u.username)+','+avC(u.username+'x')+')">'+esc(u.avatar||avT(u.nickname||u.username))+'</div><div class="uc-name">'+esc(u.nickname||u.username)+'</div><div class="uc-username">@'+esc(u.username)+'</div><div class="uc-sign">'+esc(u.signature||'这个人很懒，什么都没写')+'</div><div class="uc-stats"><div><div class="uc-stat-num">'+(u.status==='online'?'在线':u.status==='away'?'离开':u.status==='busy'?'忙碌':'离线')+'</div><div class="uc-stat-label">状态</div></div><div><div class="uc-stat-num">ID:'+u.id+'</div><div class="uc-stat-label">用户ID</div></div></div><div class="uc-actions">'+(u.is_friend?'<button class="glass-btn primary" onclick="startChat('+uid+')">发消息</button>':'<button class="glass-btn primary" onclick="addFriend('+uid+')">加好友</button>')+'<button class="glass-btn" onclick="reportUser('+uid+')">举报</button><button class="glass-btn" onclick="hideUserCard()">关闭</button></div>';
    $('#user-card').style.display='flex';
  }catch(e){alert('获取用户信息失败');}
}
function hideUserCard(){$('#user-card').style.display='none';}
async function startChat(uid){try{const c=await api('POST','/conversations/direct',{user_id:uid});hideUserCard();switchNav('chat');await loadConvs();const conv=S.convs.find(x=>x.id===c.id);if(conv)openConv(conv);}catch(e){alert(e.message);}}
async function addFriend(uid){try{await api('POST','/friends/requests',{receiver_id:uid});hideUserCard();alert('好友请求已发送');}catch(e){alert(e.message);}}
async function reportUser(uid){const reason=prompt('举报原因','');if(reason===null)return;try{await api('POST','/reports',{target_user_id:uid,reason});hideUserCard();alert('举报已提交，管理员会处理');}catch(e){alert(e.message);}}

/* ===== 弹窗 ===== */
function showModal(title,body,onOk){$('#modal-title').textContent=title;$('#modal-body').innerHTML=body;$('#modal').style.display='flex';$('#modal-ok').onclick=async()=>{if(onOk){const r=await onOk();if(r!==false)closeModal();}else closeModal();};}
function closeModal(){$('#modal').style.display='none';}
function showNewChat(){
  showModal('发起聊天','<div style="margin-bottom:12px"><div style="font-size:12px;color:var(--text-2);margin-bottom:6px">创建群聊</div><input id="m-gname" class="glass-input" placeholder="群聊名称"></div><div><div style="font-size:12px;color:var(--text-2);margin-bottom:6px">加入群聊</div><input id="m-gid" class="glass-input" placeholder="群聊ID"></div>',async()=>{
    const name=$('#m-gname').value.trim(),gid=$('#m-gid').value.trim();
    try{if(name){const g=await api('POST','/conversations/groups',{title:name,member_ids:[]});await loadConvs();const c=S.convs.find(x=>x.id===g.id);if(c)openConv(c);}else if(gid){await api('POST','/conversations/'+gid+'/join');await loadConvs();alert('已加入群聊');}}catch(e){alert(e.message);return false;}
  });
}
function showAddFriend(){
  showModal('添加好友','<input id="m-search" class="glass-input" placeholder="输入用户名或昵称搜索"><div id="m-results" style="max-height:240px;overflow-y:auto;margin-top:10px"></div>',null);
  $('#m-search').oninput=async e=>{
    const q=e.target.value.trim(),box=$('#m-results');if(!q){box.innerHTML='';return;}
    try{const users=await api('GET','/users/search?q='+encodeURIComponent(q));box.innerHTML=users.map(u=>'<div class="setting-item" onclick="sendFriendReq('+u.id+')"><div style="display:flex;align-items:center;gap:10px"><div class="avatar" style="width:32px;height:32px;font-size:12px;background:linear-gradient(135deg,'+avC(u.username)+','+avC(u.username+'x')+')">'+esc(avT(u.nickname||u.username))+'</div><div><div style="font-size:13px;font-weight:600">'+esc(u.nickname||u.username)+'</div><div style="font-size:11px;color:var(--text-2)">@'+esc(u.username)+'</div></div></div><button class="glass-btn primary" style="padding:5px 12px;font-size:11px">添加</button></div>').join('');}catch(err){box.innerHTML='<div style="padding:10px;color:var(--text-2);font-size:12px">未找到用户</div>';}
  };
}
async function sendFriendReq(id){try{await api('POST','/friends/requests',{receiver_id:id});closeModal();alert('好友请求已发送');}catch(e){alert(e.message);}}
function showCreateBot(){
  showModal('创建机器人','<input id="m-bname" class="glass-input" placeholder="机器人名称"><input id="m-bdesc" class="glass-input" placeholder="描述（可选）">',async()=>{
    const name=$('#m-bname').value.trim(),desc=$('#m-bdesc').value.trim();if(!name){alert('请输入名称');return false;}
    try{await api('POST','/bots',{name,description:desc,is_public:false});await loadBots();}catch(e){alert(e.message);return false;}
  });
}
function showPostMoment(){
  showModal('发布动态','<textarea id="m-moment" class="glass-input" placeholder="说点什么..." style="height:100px;resize:none"></textarea>',async()=>{
    const c=$('#m-moment').value.trim();if(!c){alert('请输入内容');return false;}
    S.moments.unshift({author:S.user.nickname||S.user.username,content:c,time:new Date().toISOString()});renderMoments();
  });
}

/* ===== 表情 ===== */
function renderEmojis(){
  const box=$('#emoji-panel');
  EMOJIS.slice(0,140).forEach(e=>{
    const el=document.createElement('div');el.className='emoji-item';el.textContent=e;
    el.onclick=()=>{$('#message-input').value+=e;$('#emoji-panel').style.display='none';$('#message-input').focus();};
    box.appendChild(el);
  });
}

/* ===== 主题 ===== */
function toggleTheme(){
  const c=document.documentElement.getAttribute('data-theme');
  const n=c==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',n);
  localStorage.setItem('jj_theme',n);
}

/* ===== WebSocket ===== */
function connectWS(){
  if(!S.token)return;
  if(S.ws&&(S.ws.readyState===WebSocket.OPEN||S.ws.readyState===WebSocket.CONNECTING))return;
  try{S.ws=new WebSocket('wss://junjuncaht-production.up.railway.app/ws?token='+encodeURIComponent(S.token));}catch(e){scheduleReconnect();return;}
  S.ws.onopen=()=>{S.wsRetry=0;};
  S.ws.onmessage=e=>{
    if(e.data==='pong')return;
    try{
      const d=JSON.parse(e.data);
      if(d.type==='message.created'&&d.data){
        handleIncomingMessage(d.data);
      }
    }catch(e){}
  };
  S.ws.onclose=()=>scheduleReconnect();
  S.ws.onerror=()=>{if(S.ws)S.ws.close();};
}
function scheduleReconnect(){S.wsRetry++;setTimeout(connectWS,Math.min(1000*Math.pow(2,S.wsRetry-1),30000));}

function handleIncomingMessage(m){
  if(S.conv&&String(S.conv.id)===String(m.conversation_id)){
    if(!S.messages[m.conversation_id])S.messages[m.conversation_id]=[];
    if(!S.messages[m.conversation_id].find(x=>x.id===m.id)){
      S.messages[m.conversation_id].push(m);
      renderMsgs();
    }
  }
  loadConvs().then(()=>{renderConvList();if(S.nav==='contacts')renderContacts();});
}

// 轮询兜底：每3秒检查一次会话列表更新
function startPolling(){
  if(S.pollTimer)return;
  S.pollTimer=setInterval(async()=>{
    if(!S.token)return;
    try{
      const oldTitles={};S.convs.forEach(c=>oldTitles[c.id]=c.last_message?.id||0);
      await loadConvs();
      // 检查是否有新消息
      for(const c of S.convs){
        const oldId=oldTitles[c.id]||0;
        const newId=c.last_message?.id||0;
        if(newId>oldId&&S.conv&&String(S.conv.id)===String(c.id)){
          // 当前会话有新消息，重新加载
          S.messages[c.id]=await api('GET','/conversations/'+c.id+'/messages?limit=50');
          renderMsgs();
        }
      }
      renderConvList();
    }catch(e){}
  },3000);
}
function stopPolling(){if(S.pollTimer){clearInterval(S.pollTimer);S.pollTimer=null;}}

init();
