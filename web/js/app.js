/* JunjunChat v6.0 - KukeChat风格前端 */
const API_BASE = 'https://junjuncaht-production.up.railway.app/api/v1';
const WS_BASE = 'wss://junjuncaht-production.up.railway.app';
const ADMIN_PASS = '225878';
const S = {token:null,user:null,convs:[],friends:[],bots:[],activeConv:null,currentNav:'chat',msgCache:{},ws:null,wsReconnect:0,pollTimer:null,groupInfo:null,groupMembers:[],theme:'light',posts:[],tasks:[],favorites:[],teamups:[],onlineCount:0};

// ========== 工具 ==========
const $=id=>document.getElementById(id);
const esc=s=>s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const avatarColor=n=>{const c=['#3b82f6','#8b5cf6','#06b6d4','#ec4899','#10b981','#f59e0b','#ef4444','#6366f1','#14b8a6','#a855f7'];let h=0;for(let i=0;i<(n||'?').length;i++)h=(n||'?').charCodeAt(i)+((h<<5)-h);return c[Math.abs(h)%c.length];};
const avatarText=n=>n?n.trim().charAt(0).toUpperCase():'?';
const fmtTime=iso=>{if(!iso)return'';try{const d=new Date(iso),n=new Date();if(d.toDateString()===n.toDateString())return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');return(d.getMonth()+1)+'/'+d.getDate()+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');}catch(e){return'';}};
const avatarHTML=(name,size=40)=>`<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.floor(size*0.4)}px;background:linear-gradient(135deg,${avatarColor(name)},${avatarColor(name+'x')})">${esc(avatarText(name))}</div>`;

// ========== API ==========
async function api(method,path,body){
  const h={'Content-Type':'application/json'};
  if(S.token)h['Authorization']='Bearer '+S.token;
  const o={method,headers:h};
  if(body!==undefined)o.body=JSON.stringify(body);
  try{
    const r=await fetch(API_BASE+path,o);
    const t=await r.text();let d=null;try{d=t?JSON.parse(t):null;}catch(e){d={detail:t};}
    if(!r.ok){let m=(d&&(d.detail||d.message))||('HTTP '+r.status);if(typeof m==='object')m=JSON.stringify(m);throw new Error(String(m));}
    return d;
  }catch(e){throw e;}
}
const apiGet=p=>api('GET',p);
const apiPost=(p,b)=>api('POST',p,b);
const apiPut=(p,b)=>api('PUT',p,b);
const apiDel=p=>api('DELETE',p);

// ========== 初始化 ==========
window.addEventListener('DOMContentLoaded',()=>{
  loadTheme();
  bindLogin();
  bindNav();
  bindChat();
  bindModal();
  bindContextMenu();
  bindExtra();
  // 检查自动登录
  const saved=localStorage.getItem('jj_auto_login');
  if(saved==='1'){
    const t=localStorage.getItem('jj_token');
    if(t){S.token=t;verifyLogin();}
  }
});

function loadTheme(){
  S.theme=localStorage.getItem('jj_theme')||'light';
  document.documentElement.setAttribute('data-theme',S.theme);
}
function toggleTheme(){
  S.theme=S.theme==='light'?'dark':'light';
  localStorage.setItem('jj_theme',S.theme);
  document.documentElement.setAttribute('data-theme',S.theme);
}

// ========== 登录注册 ==========
function bindLogin(){
  $('li-btn').onclick=doLogin;
  $('li-pass').onkeydown=e=>{if(e.key==='Enter')doLogin();};
  $('re-btn').onclick=doRegister;
  $('to-reg').onclick=()=>{$('login-form').style.display='none';$('reg-form').style.display='block';$('li-msg').textContent='';};
  $('to-login').onclick=()=>{$('login-form').style.display='block';$('reg-form').style.display='none';$('li-msg').textContent='';};
}
async function doLogin(){
  const u=$('li-user').value.trim(),p=$('li-pass').value;
  if(!u||!p){$('li-msg').textContent='请输入用户名和密码';return;}
  $('li-msg').textContent='';
  try{
    const d=await apiPost('/auth/login',{username_or_email:u,password:p,remember_me:true});
    S.token=d.access_token;S.user=d.user;
    if($('li-remember').checked){localStorage.setItem('jj_auto_login','1');localStorage.setItem('jj_token',S.token);}
    else{localStorage.removeItem('jj_auto_login');localStorage.removeItem('jj_token');}
    enterApp();
  }catch(e){$('li-msg').textContent=e.message;}
}
async function doRegister(){
  const u=$('re-user').value.trim(),n=$('re-nick').value.trim(),p=$('re-pass').value,p2=$('re-pass2').value;
  if(!u||!p){$('li-msg').textContent='请填写用户名和密码';return;}
  if(p!==p2){$('li-msg').textContent='两次密码不一致';return;}
  if(p.length<6){$('li-msg').textContent='密码至少6位';return;}
  $('li-msg').textContent='';
  try{
    const b={username:u,password:p};if(n)b.nickname=n;
    const d=await apiPost('/auth/register',b);
    S.token=d.access_token;S.user=d.user;
    localStorage.setItem('jj_auto_login','1');localStorage.setItem('jj_token',S.token);
    enterApp();
  }catch(e){$('li-msg').textContent=e.message;}
}
async function verifyLogin(){
  try{const u=await apiGet('/auth/me');S.user=u;enterApp();}catch(e){S.token=null;localStorage.removeItem('jj_token');localStorage.removeItem('jj_auto_login');}
}
function enterApp(){
  $('login-panel').style.display='none';
  $('main-app').style.display='flex';
  $('sidebar-avatar').textContent=avatarText(S.user.nickname||S.user.username);
  loadConvs();loadFriends();loadBots();connectWS();startPolling();
  switchNav('chat');
}
function logout(){
  closeWS();stopPolling();
  S.token=null;S.user=null;S.convs=[];S.activeConv=null;S.msgCache={};
  localStorage.removeItem('jj_token');localStorage.removeItem('jj_auto_login');
  $('main-app').style.display='none';
  $('login-panel').style.display='flex';
  $('li-user').value='';$('li-pass').value='';
}

// ========== 导航 ==========
function bindNav(){
  document.querySelectorAll('.kc-rail-item[data-nav]').forEach(el=>{
    el.onclick=()=>switchNav(el.dataset.nav);
  });
  $('btn-create-group').onclick=showCreateGroupModal;
  $('btn-announcement').onclick=showAnnouncement;
  $('sidebar-avatar').onclick=showProfile;
  $('btn-list-add').onclick=handleListAdd;
  $('search-input').oninput=e=>renderList(e.target.value);
}
function switchNav(nav){
  S.currentNav=nav;
  document.querySelectorAll('.kc-rail-item[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===nav));
  const titles={chat:'消息',teamup:'组队中心',posts:'动态',contacts:'联系人',bots:'机器人',home:'主页',tasks:'任务',favorites:'收藏',settings:'设置'};
  $('list-title').textContent=titles[nav]||'';
  // 显示/隐藏列表面板
  const showList=['chat','contacts','bots'].includes(nav);
  $('list-panel').style.display=showList?'flex':'none';
  // 切换视图
  document.querySelectorAll('.kc-view').forEach(v=>v.style.display='none');
  const view=$('view-'+nav);
  if(view)view.style.display='flex';
  // 搜索框
  $('search-input').value='';
  // 渲染
  if(nav==='chat')renderList();
  else if(nav==='contacts')renderContacts();
  else if(nav==='bots')renderBots();
  else if(nav==='posts')renderPosts();
  else if(nav==='home')renderHome();
  else if(nav==='teamup')renderTeamup();
  else if(nav==='tasks')renderTasks();
  else if(nav==='favorites')renderFavorites();
  else if(nav==='settings')renderSettings();
}

// ========== 列表渲染 ==========
function renderList(filter){
  const box=$('list-container');
  if(S.currentNav==='chat')renderConvList(box,filter);
  else if(S.currentNav==='contacts')renderFriendList(box,filter);
  else if(S.currentNav==='bots')renderBotList(box,filter);
}
function renderConvList(box,filter){
  let list=S.convs||[];
  if(filter)list=list.filter(c=>(c.title||'').toLowerCase().includes(filter.toLowerCase()));
  if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px 20px"><div class="empty-icon">💬</div><p>暂无会话</p></div>';return;}
  box.innerHTML=list.map(c=>{
    const last=c.last_message?c.last_message.content:'';
    return `<div class="kc-list-item ${S.activeConv&&S.activeConv.id===c.id?'active':''}" onclick="openConv(${c.id})">
      ${avatarHTML(c.title)}
      <div class="kc-list-item-info">
        <div class="kc-list-item-name">${esc(c.title||'会话')}</div>
        <div class="kc-list-item-msg">${esc(last||'暂无消息')}</div>
      </div>
      ${c.type==='group'?'<span style="font-size:10px;color:var(--kc-muted)">群</span>':''}
    </div>`;
  }).join('');
}
function renderFriendList(box,filter){
  let list=S.friends||[];
  if(filter)list=list.filter(f=>(f.nickname||f.username||'').toLowerCase().includes(filter.toLowerCase()));
  if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px 20px"><div class="empty-icon">👥</div><p>暂无好友<br>点右上角+添加</p></div>';return;}
  box.innerHTML=list.map(f=>`<div class="kc-list-item" onclick="openDirect(${f.id})">
    ${avatarHTML(f.nickname||f.username)}
    <div class="kc-list-item-info"><div class="kc-list-item-name">${esc(f.nickname||f.username)}</div><div class="kc-list-item-msg">@${esc(f.username)}</div></div>
    <div class="status-dot ${f.status==='online'?'online':'offline'}"></div>
  </div>`).join('');
}
function renderBotList(box,filter){
  let list=S.bots||[];
  if(filter)list=list.filter(b=>(b.name||'').toLowerCase().includes(filter.toLowerCase()));
  if(!list.length){box.innerHTML='<div class="empty-state" style="padding:40px 20px"><div class="empty-icon">🤖</div><p>暂无机器人<br>点右上角+创建</p></div>';return;}
  box.innerHTML=list.map(b=>`<div class="kc-list-item" onclick="showBotDetail(${b.id})">
    <div class="avatar" style="background:linear-gradient(135deg,#8b5cf6,#3b82f6)">B</div>
    <div class="kc-list-item-info"><div class="kc-list-item-name">${esc(b.name)}</div><div class="kc-list-item-msg">${esc(b.description||'机器人')}</div></div>
    <span class="badge ${b.is_online?'online':'offline'}">${b.is_online?'在线':'离线'}</span>
  </div>`).join('');
}

// ========== 数据加载 ==========
async function loadConvs(){try{S.convs=await apiGet('/conversations');if(S.currentNav==='chat')renderList();}catch(e){S.convs=[];}}
async function loadFriends(){try{S.friends=await apiGet('/friends');if(S.currentNav==='contacts')renderList();}catch(e){S.friends=[];}}
async function loadBots(){try{S.bots=await apiGet('/bots/mine');if(S.currentNav==='bots'){renderList();renderBotsPage();}}catch(e){S.bots=[];}}

// ========== 聊天 ==========
function bindChat(){
  $('btn-send').onclick=sendMsg;
  $('message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey){e.preventDefault();sendMsg();}};
  $('btn-emoji').onclick=toggleEmoji;
  $('btn-group-menu').onclick=e=>{e.stopPropagation();showGroupMenu(e);};
  $('btn-close-gs').onclick=()=>{$('group-sidebar').style.display='none';};
}
async function openConv(id){
  const c=S.convs.find(x=>x.id===id);if(!c)return;
  S.activeConv=c;
  $('chat-title').textContent=c.title||'会话';
  $('btn-group-menu').style.display=c.type==='group'?'flex':'none';
  $('group-announcement').style.display='none';
  $('group-sidebar').style.display='none';
  if(!S.msgCache[id]){try{S.msgCache[id]=await apiGet('/conversations/'+id+'/messages?limit=50');}catch(e){S.msgCache[id]=[];}}
  renderMessages();
  if(c.type==='group'){loadGroupInfo(id);}
  renderList();
}
async function openDirect(uid){
  try{const c=await apiPost('/conversations/direct',{user_id:uid});await loadConvs();openConv(c.id);switchNav('chat');}catch(e){alert(e.message);}
}
function renderMessages(){
  const box=$('messages-container');if(!S.activeConv)return;
  const msgs=S.msgCache[S.activeConv.id]||[];
  if(!msgs.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">💬</div><p>开始聊天吧</p></div>';return;}
  box.innerHTML=msgs.map(m=>{
    const isMe=S.user&&String(m.sender_id)===String(S.user.id);
    const s=m.sender||{};const name=s.nickname||s.username||'用户';
    let content=esc(m.content);
    try{content=marked.parse(m.content);}catch(e){}
    return `<div class="message ${isMe?'me':'other'}">
      ${avatarHTML(name,34)}
      <div class="message-body">
        ${!isMe?`<div class="message-sender">${esc(name)}</div>`:''}
        <div class="message-bubble ${isMe?'me':'other'}"><div class="markdown-body">${content}</div></div>
        <div class="message-time">${fmtTime(m.created_at)}</div>
      </div>
    </div>`;
  }).join('');
  box.scrollTop=box.scrollHeight;
}
async function sendMsg(){
  const input=$('message-input');const content=input.value.trim();
  if(!content||!S.activeConv)return;
  input.value='';
  try{
    const m=await apiPost('/conversations/'+S.activeConv.id+'/messages',{content});
    if(!S.msgCache[S.activeConv.id])S.msgCache[S.activeConv.id]=[];
    S.msgCache[S.activeConv.id].push(m);
    renderMessages();loadConvs();
  }catch(e){input.value=content;alert('发送失败: '+e.message);}
}

// ========== 表情 ==========
const EMOJIS=['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','👏','🙌','👐','🤲','🙏','✍️','💪','🦾','🦵','🦶','👂','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🗣️','👤','👥','👶','👧','🧒','👦','👩','🧑','👨','👵','🧓','👴','👲','🧕','👮','🕵️','💂','🥷','👷','🤵','👰','🤰','👼','🎅','🤶','🦸','🦹','🧙','🧝','🧛','🧟','🧞','🧜','🧚','👯','💃','🕺','👫','👬','👭','🚶','🏃','💃','🕺','👯','🧖','🧗','🤺','🏇','⛷️','🏂','🏋️','🤼','🤸','⛹️','🤾','🏌️','🏄','🏊','🤽','🚣','🧘','🛀','🛌','👭','👫','👬','💑','💏','👪','👨‍👩‍👧','👨‍👩‍👧‍👦','👨‍👩‍👦‍👦','👨‍👩‍👧‍👧','👩‍👩‍👦','👩‍👩‍👧','👩‍👩‍👧‍👦','👨‍👨‍👦','👨‍👨‍👧','👨‍👨‍👧‍👦','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌎','🌍','🌏','⭐','🌟','✨','⚡','🔥','💧','🌊','🌈','☀️','⛅','☁️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌫️','🌫','🌁','❄️','☃️','⛄','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍵','☕','🍶','🍾','🍷','🍸','🍹','🍺','🥂','🥃','🍼','🥤','🧃','🧉','🧊','🥢','🍽️','🍴','🥄','🔪','🏺','🌍','🌎','🌏','🌐','🗺️','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🧱','⛺','🏠','🏡','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🕍','🛕','🕋','⛩️','🕯️','🪔','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','💊','💉','🩹','🩺','❤️‍🩹','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧯','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'];
function toggleEmoji(){
  const p=$('emoji-panel');
  if(p.style.display==='none'||!p.style.display){
    p.style.display='grid';
    if(!p.children.length)p.innerHTML=EMOJIS.map(e=>`<div class="emoji-item" onclick="insertEmoji('${e}')">${e}</div>`).join('');
  }else p.style.display='none';
}
function insertEmoji(e){const i=$('message-input');i.value+=e;i.focus();}

// ========== 群管理 ==========
async function loadGroupInfo(id){
  try{
    S.groupInfo=await apiGet('/conversations/'+id);
    S.groupMembers=await apiGet('/conversations/'+id+'/members');
    if(S.groupInfo.announcement){$('group-announcement').style.display='block';$('group-announcement').textContent='📢 '+S.groupInfo.announcement;}
    renderGroupSidebar();
  }catch(e){S.groupInfo=null;S.groupMembers=[];}
}
function renderGroupSidebar(){
  if(!S.groupInfo)return;
  const g=S.groupInfo;const myRole=getMyRole();
  $('gs-content').innerHTML=`
    <div class="kc-gs-section" style="text-align:center">
      <div class="kc-gs-avatar">${esc(avatarText(g.title))}</div>
      <div class="kc-gs-name">${esc(g.title)}</div>
      <div class="kc-gs-id">群号: ${g.id} · ${S.groupMembers.length}人</div>
    </div>
    ${g.announcement?`<div class="kc-gs-section"><div style="font-size:12px;color:var(--kc-muted);margin-bottom:6px">群公告</div><div class="kc-gs-announcement">${esc(g.announcement)}</div></div>`:''}
    <div class="kc-gs-section"><div style="font-size:12px;color:var(--kc-muted);margin-bottom:8px">群成员 (${S.groupMembers.length})</div>
      ${S.groupMembers.map(m=>{const u=m;const name=u.nickname||u.username||'用户';return `<div class="kc-gs-member" onclick="showUserCard(${u.id})">
        ${avatarHTML(name,32)}<div class="kc-gs-member-name">${esc(name)}</div>
        ${m.role==='owner'?'<span class="kc-gs-role owner">群主</span>':m.role==='admin'?'<span class="kc-gs-role admin">管理员</span>':''}
      </div>`;}).join('')}
    </div>
    <div class="kc-gs-section">
      ${myRole==='owner'?`<button class="kc-gs-btn" onclick="editGroupName()">修改群名</button><button class="kc-gs-btn" onclick="editAnnouncement()">编辑公告</button><button class="kc-gs-btn danger" onclick="dissolveGroup()">解散群聊</button>`:''}
      ${myRole==='admin'?`<button class="kc-gs-btn" onclick="editAnnouncement()">发布公告</button>`:''}
      <button class="kc-gs-btn" onclick="leaveGroup()">退出群聊</button>
    </div>`;
}
function getMyRole(){if(!S.groupMembers||!S.user)return'member';const m=S.groupMembers.find(x=>String(x.id)===String(S.user.id));return m?m.role:'member';}
function showGroupMenu(e){
  if(!S.groupInfo){loadGroupInfo(S.activeConv.id).then(()=>showGroupMenu(e));return;}
  const role=getMyRole();
  const items=[];
  if(role==='owner'){items.push({t:'修改群名',fn:'editGroupName()'},{t:'编辑公告',fn:'editAnnouncement()'},{t:'解散群聊',fn:'dissolveGroup()',danger:true});}
  else if(role==='admin'){items.push({t:'发布公告',fn:'editAnnouncement()'});}
  items.push({t:'查看群信息',fn:"$('group-sidebar').style.display='flex'"});
  items.push({t:'退出群聊',fn:'leaveGroup()',danger:true});
  showPopupMenu(e,items);
}
async function editGroupName(){
  const name=prompt('输入新群名',S.groupInfo.title);if(!name)return;
  try{await apiPut('/conversations/'+S.activeConv.id,{title:name});await loadGroupInfo(S.activeConv.id);await loadConvs();$('chat-title').textContent=name;}catch(e){alert(e.message);}
}
async function editAnnouncement(){
  const a=prompt('输入公告内容',S.groupInfo.announcement||'');if(a===null)return;
  try{await apiPut('/conversations/'+S.activeConv.id,{announcement:a});await loadGroupInfo(S.activeConv.id);}catch(e){alert(e.message);}
}
async function dissolveGroup(){
  if(!confirm('确定解散该群聊？此操作不可恢复！'))return;
  try{await apiDel('/conversations/'+S.activeConv.id);S.activeConv=null;S.groupInfo=null;$('group-sidebar').style.display='none';await loadConvs();switchNav('chat');}catch(e){alert(e.message);}
}
async function leaveGroup(){
  if(!confirm('确定退出该群聊？'))return;
  try{await apiPost('/conversations/'+S.activeConv.id+'/leave');S.activeConv=null;S.groupInfo=null;$('group-sidebar').style.display='none';await loadConvs();switchNav('chat');}catch(e){alert(e.message);}
}

// ========== 用户名片 ==========
async function showUserCard(uid){
  try{
    const u=await apiGet('/users/'+uid+'/profile');
    if(!u){alert('用户不存在');return;}
    const isFriend=u.is_friend||S.friends.some(f=>String(f.id)===String(uid));
    $('user-card-content').innerHTML=`
      <div class="uc-avatar" style="background:linear-gradient(135deg,${avatarColor(u.username)},${avatarColor(u.username+'x')})">${esc(avatarText(u.nickname||u.username))}</div>
      <div class="uc-name">${esc(u.nickname||u.username)}</div>
      <div class="uc-username">@${esc(u.username)} · ID: ${u.id}</div>
      <div class="uc-sign">${esc(u.signature||'这个人很懒，什么都没写')}</div>
      <div class="uc-stats"><div><div class="uc-stat-num">${u.id}</div><div class="uc-stat-label">ID</div></div></div>
      <div class="uc-actions">
        ${isFriend?'<button class="glass-btn primary" onclick="openDirect('+u.id+');closeUserCard()">发消息</button>':'<button class="glass-btn primary" onclick="addFriend('+u.id+');closeUserCard()">加好友</button>'}
        <button class="glass-btn" onclick="reportUser(${u.id})">举报</button>
      </div>`;
    $('user-card').style.display='flex';
  }catch(e){alert('获取用户信息失败');}
}
function closeUserCard(){$('user-card').style.display='none';}
$('user-card').addEventListener('click',e=>{if(e.target.id==='user-card')closeUserCard();});
async function addFriend(uid){try{await apiPost('/friends/requests',{receiver_id:uid});alert('好友请求已发送');}catch(e){alert(e.message);}}
async function reportUser(uid){const reason=prompt('请输入举报原因');if(!reason)return;try{await apiPost('/reports',{target_user_id:uid,reason});alert('举报已提交，感谢反馈');}catch(e){alert(e.message);}}

// ========== 添加按钮 ==========
function handleListAdd(){
  if(S.currentNav==='chat'||S.currentNav==='contacts')showAddFriendModal();
  else if(S.currentNav==='bots')showCreateBotModal();
}
function showAddFriendModal(){
  showModal('添加好友','<input id="m-search" class="glass-input" placeholder="输入用户名搜索" style="margin-bottom:10px"><div id="m-results" style="max-height:200px;overflow-y:auto"></div>',async()=>{return true;});
  $('m-search').oninput=async e=>{
    const q=e.target.value.trim();const box=$('m-results');if(!q){box.innerHTML='';return;}
    try{const users=await apiGet('/users/search?q='+encodeURIComponent(q));
      box.innerHTML=users.map(u=>`<div class="kc-list-item" onclick="addFriend(${u.id});closeModal()"><div class="avatar" style="width:32px;height:32px;font-size:12px">${esc(avatarText(u.nickname||u.username))}</div><div style="flex:1"><div style="font-size:13px;font-weight:600">${esc(u.nickname||u.username)}</div><div style="font-size:11px;color:var(--kc-muted)">@${esc(u.username)}</div></div></div>`).join('');
    }catch(err){box.innerHTML='<div style="padding:10px;color:var(--kc-muted);font-size:12px">未找到用户</div>';}
  };
}
function showCreateGroupModal(){
  showModal('创建群聊','<input id="m-gname" class="glass-input" placeholder="群聊名称">',async()=>{
    const name=$('m-gname').value.trim();if(!name){alert('请输入群名');return false;}
    try{const g=await apiPost('/conversations/groups',{title:name,member_ids:[]});await loadConvs();openConv(g.id);switchNav('chat');}catch(e){alert(e.message);return false;}
  });
}
function showCreateBotModal(){
  showModal('创建机器人','<input id="m-bname" class="glass-input" placeholder="机器人名称" style="margin-bottom:10px"><input id="m-bdesc" class="glass-input" placeholder="描述（可选）">',async()=>{
    const name=$('m-bname').value.trim();const desc=$('m-bdesc').value.trim();if(!name){alert('请输入名称');return false;}
    try{await apiPost('/bots',{name,description:desc,is_public:false});await loadBots();}catch(e){alert(e.message);return false;}
  });
}

// ========== 机器人 ==========
function renderBotsPage(){
  const box=$('bots-content');if(!box)return;
  const total=S.bots.length,online=S.bots.filter(b=>b.is_online).length;
  $('bot-stats').innerHTML=`
    <div class="bot-stat-card"><div class="bot-stat-num">${total}</div><div class="bot-stat-label">机器人总数</div></div>
    <div class="bot-stat-card"><div class="bot-stat-num">${online}</div><div class="bot-stat-label">在线</div></div>
    <div class="bot-stat-card"><div class="bot-stat-num">${total-online}</div><div class="bot-stat-label">离线</div></div>
    <div class="bot-stat-card"><div class="bot-stat-num">${S.convs.length}</div><div class="bot-stat-label">会话数</div></div>`;
  if(!S.bots.length){box.innerHTML='<div class="empty-state" style="padding:60px"><div class="empty-icon">🤖</div><p>还没有机器人，点右上角+创建</p></div>';return;}
  box.innerHTML=S.bots.map(b=>`<div class="bot-card" onclick="showBotDetail(${b.id})">
    <div class="bot-card-header"><div class="bot-card-avatar">B</div><div><div class="bot-card-name">${esc(b.name)}</div><span class="badge ${b.is_online?'online':'offline'}">${b.is_online?'在线':'离线'}</span></div></div>
    <div class="bot-card-desc">${esc(b.description||'暂无描述')}</div>
    <div class="bot-card-footer"><span style="font-size:11px;color:var(--kc-muted)">ID: ${b.id}</span><span style="font-size:11px;color:var(--kc-accent);font-weight:600">查看详情 →</span></div>
  </div>`).join('');
}
async function showBotDetail(bid){
  const b=S.bots.find(x=>x.id===bid);if(!b)return;
  const groups=S.convs.filter(c=>c.type==='group');
  showModal('机器人: '+b.name,`
    <div style="text-align:center;margin-bottom:16px"><div class="bot-card-avatar" style="margin:0 auto 10px;width:64px;height:64px;font-size:24px">B</div><div style="font-size:18px;font-weight:700">${esc(b.name)}</div><span class="badge ${b.is_online?'online':'offline'}">${b.is_online?'在线':'离线'}</span></div>
    <div style="font-size:12px;color:var(--kc-muted);margin-bottom:6px">Bot Key（点击复制）:</div>
    <div class="bot-key-box" onclick="navigator.clipboard.writeText('${b.bot_key}');this.textContent='已复制!'">${esc(b.bot_key)}</div>
    <div style="font-size:12px;color:var(--kc-muted);margin:14px 0 6px">WebSocket:</div>
    <div class="code-block">wss://junjuncaht-production.up.railway.app/bot/ws?key=${esc(b.bot_key)}</div>
    <div style="font-size:12px;color:var(--kc-muted);margin:14px 0 6px">加入群聊:</div>
    <select id="m-bot-group" class="glass-input" style="margin-bottom:8px"><option value="">选择群聊...</option>${groups.map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join('')}</select>
    <button class="glass-btn primary" style="width:100%" onclick="botJoinGroup(${b.id})">加入群聊</button>
  `,async()=>{return true;});
}
async function botJoinGroup(bid){
  const gid=$('m-bot-group').value;if(!gid){alert('请选择群聊');return;}
  try{await apiPost('/bots/'+bid+'/join/'+gid);alert('机器人已加入群聊');closeModal();}catch(e){alert(e.message);}
}

// ========== 其他页面 ==========
function renderContacts(){$('contacts-content').innerHTML='<div class="empty-state"><div class="empty-icon">👥</div><p>在左侧列表选择好友开始聊天</p></div>';}
function renderPosts(){
  const box=$('space-container');
  if(!S.posts.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">📝</div><p>还没有动态，点右上角✏️发布第一条</p></div>';return;}
  box.innerHTML=S.posts.map(p=>`<div class="moment-card"><div class="moment-header">${avatarHTML(p.author||'用户',36)}<div><div style="font-weight:600;font-size:14px">${esc(p.author||'用户')}</div><div style="font-size:11px;color:var(--kc-muted)">${fmtTime(p.time)}</div></div></div><div class="moment-content">${esc(p.content)}</div></div>`).join('');
}
function bindExtra(){
  const pm=$('btn-post-moment');if(pm)pm.onclick=()=>{const c=prompt('发布动态');if(c){S.posts.unshift({author:S.user.nickname||S.user.username,content:c,time:new Date().toISOString()});renderPosts();}};
  const at=$('btn-add-task');if(at)at.onclick=()=>{const t=prompt('添加任务');if(t){S.tasks.push({text:t,done:false});renderTasks();}};
}
function renderHome(){$('home-content').innerHTML=`<div style="max-width:600px;margin:0 auto"><div class="card" style="margin-bottom:16px"><div class="card-header">${avatarHTML(S.user.nickname||S.user.username,48)}<div><div class="card-title">${esc(S.user.nickname||S.user.username)}</div><div style="font-size:12px;color:var(--kc-muted)">@${esc(S.user.username)} · ID: ${S.user.id}</div></div></div><div class="card-desc">${esc(S.user.signature||'这个人很懒，什么都没写')}</div></div><div class="bot-stats" style="grid-template-columns:repeat(3,1fr)"><div class="bot-stat-card"><div class="bot-stat-num">${S.convs.length}</div><div class="bot-stat-label">会话</div></div><div class="bot-stat-card"><div class="bot-stat-num">${S.friends.length}</div><div class="bot-stat-label">好友</div></div><div class="bot-stat-card"><div class="bot-stat-num">${S.bots.length}</div><div class="bot-stat-label">机器人</div></div></div></div>`;}
function renderTeamup(){$('teamup-content').innerHTML='<div class="empty-state"><div class="empty-icon">🎮</div><p>组队中心开发中...</p></div>';}
function renderTasks(){
  const box=$('tasks-content');
  if(!S.tasks.length){box.innerHTML='<div class="empty-state"><div class="empty-icon">✅</div><p>还没有任务，点右上角+添加</p></div>';return;}
  box.innerHTML=S.tasks.map((t,i)=>`<div class="task-item"><div class="task-check ${t.done?'done':''}" onclick="toggleTask(${i})">${t.done?'✓':''}</div><div class="task-text ${t.done?'done':''}">${esc(t.text)}</div><button class="kc-icon-btn" onclick="delTask(${i})">×</button></div>`).join('');
}
function toggleTask(i){S.tasks[i].done=!S.tasks[i].done;renderTasks();}
function delTask(i){S.tasks.splice(i,1);renderTasks();}
function renderFavorites(){$('favorites-content').innerHTML='<div class="empty-state"><div class="empty-icon">⭐</div><p>收藏功能开发中...</p></div>';}
function renderSettings(){
  $('settings-content').innerHTML=`
    <div class="setting-section"><h3>账号</h3>
      <div class="setting-item"><span>用户名</span><span style="color:var(--kc-muted)">${esc(S.user.username)}</span></div>
      <div class="setting-item"><span>昵称</span><input class="glass-input" id="set-nick" value="${esc(S.user.nickname||'')}"></div>
      <div class="setting-item"><span>个性签名</span><input class="glass-input" id="set-sign" value="${esc(S.user.signature||'')}"></div>
      <div class="setting-item"><span>状态</span><select class="glass-input" id="set-status"><option value="online" ${S.user.status==='online'?'selected':''}>在线</option><option value="away" ${S.user.status==='away'?'selected':''}>离开</option><option value="busy" ${S.user.status==='busy'?'selected':''}>忙碌</option><option value="offline" ${S.user.status==='offline'?'selected':''}>隐身</option></select></div>
      <div class="setting-item"><span></span><button class="glass-btn primary" onclick="saveProfile()">保存修改</button></div>
    </div>
    <div class="setting-section"><h3>外观</h3>
      <div class="setting-item"><span>深色模式</span><button class="glass-btn" onclick="toggleTheme()">${S.theme==='dark'?'已开启':'已关闭'}</button></div>
    </div>
    <div class="setting-section"><h3>关于</h3>
      <div class="setting-item"><span>版本</span><span style="color:var(--kc-muted)">v6.0</span></div>
      <div class="setting-item"><span>管理员</span><input type="password" class="glass-input" id="admin-pass" placeholder="输入管理员密码" style="max-width:140px"><button class="glass-btn" onclick="enterAdmin()">进入</button></div>
    </div>
    <div class="setting-section"><h3>账号操作</h3>
      <div class="setting-item"><span></span><button class="glass-btn danger" onclick="logout()">退出登录</button></div>
    </div>`;
}
async function saveProfile(){
  const nick=$('set-nick').value.trim(),sign=$('set-sign').value.trim(),status=$('set-status').value;
  try{
    await apiPut('/auth/profile',{nickname:nick,signature:sign});
    await apiPut('/auth/status',{status});
    S.user.nickname=nick;S.user.signature=sign;S.user.status=status;
    alert('保存成功');
  }catch(e){alert(e.message);}
}
function enterAdmin(){if($('admin-pass').value===ADMIN_PASS){alert('管理员模式已开启');}else alert('密码错误');}
function showProfile(){switchNav('settings');}
function showAnnouncement(){alert('暂无公告');}

// ========== 弹窗 ==========
let modalOkFn=null;
function showModal(title,body,onOk){
  $('modal-title').textContent=title;$('modal-body').innerHTML=body;$('modal').style.display='flex';modalOkFn=onOk;
}
function closeModal(){$('modal').style.display='none';modalOkFn=null;}
$('modal-close').onclick=closeModal;
$('modal-cancel').onclick=closeModal;
$('modal-ok').onclick=async()=>{if(modalOkFn){const r=await modalOkFn();if(r!==false)closeModal();}else closeModal();};
$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
function bindModal(){}

// ========== 右键菜单 ==========
function bindContextMenu(){
  document.addEventListener('click',()=>{$('context-menu').style.display='none';$('group-menu-popup').style.display='none';});
}
function showContextMenu(e,items){
  e.preventDefault();e.stopPropagation();
  const m=$('context-menu');
  m.innerHTML=items.map(it=>it.divider?'<div class="context-menu-divider"></div>':`<div class="context-menu-item ${it.danger?'danger':''}" onclick="${it.fn};$('context-menu').style.display='none'">${it.t}</div>`).join('');
  m.style.left=e.clientX+'px';m.style.top=e.clientY+'px';m.style.display='block';
}
function showPopupMenu(e,items){
  e.stopPropagation();
  const m=$('group-menu-popup');
  m.innerHTML=items.map(it=>`<div class="context-menu-item ${it.danger?'danger':''}" onclick="${it.fn};$('group-menu-popup').style.display='none'">${it.t}</div>`).join('');
  const r=e.target.getBoundingClientRect();
  m.style.left=(r.right-200)+'px';m.style.top=(r.bottom+6)+'px';m.style.display='block';
}

// ========== WebSocket ==========
function connectWS(){
  if(!S.token)return;
  if(S.ws&&(S.ws.readyState===1||S.ws.readyState===0))return;
  try{S.ws=new WebSocket(WS_BASE+'/ws?token='+encodeURIComponent(S.token));}catch(e){scheduleWSReconnect();return;}
  S.ws.onopen=()=>{S.wsReconnect=0;};
  S.ws.onmessage=evt=>{
    if(evt.data==='pong')return;
    try{const msg=JSON.parse(evt.data);if(msg.type==='message.created'&&msg.data){handleNewMsg(msg.data);}}catch(e){}
  };
  S.ws.onclose=()=>{scheduleWSReconnect();};
  S.ws.onerror=()=>{if(S.ws)S.ws.close();};
}
function scheduleWSReconnect(){S.wsReconnect++;const delay=Math.min(1000*Math.pow(2,S.wsReconnect-1),30000);setTimeout(connectWS,delay);}
function closeWS(){if(S.ws){try{S.ws.close();}catch(e){}S.ws=null;}}
function handleNewMsg(d){
  const cid=d.conversation_id;
  if(S.activeConv&&String(S.activeConv.id)===String(cid)){
    if(!S.msgCache[cid])S.msgCache[cid]=[];
    S.msgCache[cid].push(d);renderMessages();
  }
  loadConvs();
  // 更新未读
  const badge=$('unread-badge');
  if(!S.activeConv||String(S.activeConv.id)!==String(cid)){
    S.onlineCount=(S.onlineCount||0)+1;badge.textContent=S.onlineCount;badge.style.display='flex';
  }
}
function startPolling(){stopPolling();S.pollTimer=setInterval(async()=>{try{const c=await apiGet('/conversations');if(JSON.stringify(c)!==JSON.stringify(S.convs)){S.convs=c;if(S.currentNav==='chat')renderList();if(S.activeConv){const nc=c.find(x=>x.id===S.activeConv.id);if(nc&&nc.last_message){const last=S.msgCache[S.activeConv.id];if(!last||!last.length||last[last.length-1].id!==nc.last_message.id){S.msgCache[S.activeConv.id]=await apiGet('/conversations/'+S.activeConv.id+'/messages?limit=50');renderMessages();}}}}}catch(e){}},3000);}
function stopPolling(){if(S.pollTimer){clearInterval(S.pollTimer);S.pollTimer=null;}}
