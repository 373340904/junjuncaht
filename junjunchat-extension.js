/* ============================================================
 * JunjunChat CCW 拓展 - 独立服务端版
 * - SVG 图标（无 emoji）
 * - Shadow DOM 样式隔离
 * - 指数退避 WebSocket 重连 + 心跳超时
 * - 蓝紫渐变 QQ 风格
 * - 连接自建 JunjunChat 服务端（无 ClientProof）
 * ============================================================ */

(function (global) {
  'use strict';

  // ========== 配置（本地HTTPS，自签名证书，需在浏览器信任一次）==========
  const API_BASE = 'https://localhost:8000/api/v1';
  const WS_BASE = 'wss://localhost:8000';
  const EXT_ID = 'junjunchat';
  const WIN_W = 880, WIN_H = 600;
  const HEARTBEAT_MS = 25000;
  const PONG_TIMEOUT_MS = 10000;
  const RECONNECT_BASE = 1000;
  const RECONNECT_MAX = 30000;
  const RECONNECT_JITTER = 500;

  // ========== SVG 图标库 ==========
  const ICONS = {
    logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    maximize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    userPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    atSign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>',
    hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>'
  };

  function icon(name, size) {
    const s = size || 18;
    return '<span style="display:inline-flex;width:'+s+'px;height:'+s+'px;align-items:center;justify-content:center;">'+ICONS[name]+'</span>';
  }

  // ========== 工具函数 ==========
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function formatTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso), now = new Date();
      if (d.toDateString()===now.toDateString()) return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
      return (d.getMonth()+1)+'/'+d.getDate()+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
    } catch(e) { return ''; }
  }
  function avatarColor(name) {
    const c = ['#4aa8ff','#8b5cf6','#39e7ff','#ff5fd2','#4ecdc4','#ff6b6b','#ffd93d','#6bcb77','#ff9a3c','#c780fa'];
    let h=0; for(let i=0;i<(name||'?').length;i++) h=(name||'?').charCodeAt(i)+((h<<5)-h);
    return c[Math.abs(h)%c.length];
  }
  function avatarText(name) { return name ? name.trim().charAt(0).toUpperCase() : '?'; }

  // ========== API 客户端（无 ClientProof）==========
  class JunjunApi {
    constructor() { this.token=null; this._botKey=null; }
    setToken(t){this.token=t;}
    setBotKey(k){this._botKey=k;}
    async request(method,path,body) {
      const isBot=path.startsWith('/bot-api');
      let headers={'Content-Type':'application/json'};
      if(isBot){ if(this._botKey) headers['Authorization']='Bot '+this._botKey; }
      else if(this.token) headers['Authorization']='Bearer '+this.token;
      const opts={method:method,headers:headers};
      if(body!==undefined) opts.body=JSON.stringify(body);
      const res=await fetch(API_BASE+path,opts);
      const text=await res.text();
      let data=null; try{data=text?JSON.parse(text):null;}catch(e){data={detail:text};}
      if(!res.ok){ let m=(data&&(data.detail||data.message))||('HTTP '+res.status); if(typeof m==='object') m=JSON.stringify(m); throw new Error(String(m)); }
      return data;
    }
    register(u,p,n){const b={username:u,password:p};if(n)b.nickname=n;return this.request('POST','/auth/register',b);}
    login(u,p){return this.request('POST','/auth/login',{username_or_email:u,password:p,remember_me:true});}
    me(){return this.request('GET','/auth/me');}
    friends(){return this.request('GET','/friends');}
    sendFriendRequest(rid){return this.request('POST','/friends/requests',{receiver_id:rid});}
    incomingRequests(){return this.request('GET','/friends/requests/incoming');}
    acceptRequest(id){return this.request('POST','/friends/requests/'+id+'/accept');}
    rejectRequest(id){return this.request('POST','/friends/requests/'+id+'/reject');}
    conversations(){return this.request('GET','/conversations');}
    createDirect(uid){return this.request('POST','/conversations/direct',{user_id:uid});}
    createGroup(title){return this.request('POST','/conversations/groups',{title:title,member_ids:[]});}
    joinGroup(cid){return this.request('POST','/conversations/'+cid+'/join');}
    messages(cid,limit){return this.request('GET','/conversations/'+cid+'/messages?limit='+(limit||50));}
    sendMessage(cid,content){return this.request('POST','/conversations/'+cid+'/messages',{content:content});}
    searchUser(q){return this.request('GET','/users/search?q='+encodeURIComponent(q));}
    myBots(){return this.request('GET','/bots/mine');}
    createBot(name,desc){return this.request('POST','/bots',{name:name,description:desc||'',is_public:false});}
    rotateKey(bid){return this.request('POST','/bots/'+bid+'/rotate-key');}
    botMe(key){this.setBotKey(key);return this.request('GET','/bot-api/me');}
    botSendMessage(key,cid,msg){this.setBotKey(key);return this.request('POST','/bot-api/conversations/'+cid+'/messages',{message:msg});}
    botSendDM(key,uid,msg){this.setBotKey(key);return this.request('POST','/bot-api/users/'+uid+'/messages',{message:msg});}
  }

  // ========== 主拓展类 ==========
  class JunjunChatExtension {
    constructor(runtime) {
      this.runtime=runtime;
      this.api=new JunjunApi();
      this.currentUser=null;
      this._unread=0;
      this.joinedGroups={};
      this.botKey=null; this.botWs=null; this._botConnected=false; this.botInfo=null; this.botUserId=null;
      this._botPingId=null; this._botPongTimer=null; this._botReconnectTimer=null; this._botReconnectAttempt=0;
      this._botManualDisconnect=false;
      this.lastMsg={sender:'',senderId:'',conversationId:'',content:''};
      this.lastAt={sender:'',senderId:'',conversationId:'',content:''};
      this.userWs=null; this._userPingId=null; this._userPongTimer=null; this._userReconnectTimer=null; this._userReconnectAttempt=0;
      this._host=null; this._shadow=null; this._win=null;
      this._visible=false; this._fullscreen=false;
      this._activeConv=null; this._convList=[]; this._friendList=[]; this._msgCache={};
      this._currentTab='chat'; this._modalConfirm=null;
      this._createHost();
    }

    _createHost() {
      if (document.getElementById('jj-chat-host')) return;
      const host=document.createElement('div');
      host.id='jj-chat-host';
      host.style.cssText='position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
      document.body.appendChild(host);
      this._host=host;
      this._shadow=host.attachShadow({mode:'open'});
      this._injectStyles();
      this._buildWindow();
    }

    _injectStyles() {
      const s=document.createElement('style');
      s.textContent=`
        @keyframes jj-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes jj-glow{0%,100%{box-shadow:0 0 20px rgba(74,168,255,.3)}50%{box-shadow:0 0 35px rgba(139,92,246,.5)}}
        @keyframes jj-slide-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes jj-fade{from{opacity:0}to{opacity:1}}
        @keyframes jj-scale-in{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
        @keyframes jj-shimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
        @keyframes jj-orb{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(25px,-15px) scale(1.08)}66%{transform:translate(-15px,12px) scale(.94)}}
        *{box-sizing:border-box;margin:0;padding:0;}
        .jj-win{font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;color:#e8f0ff;}
        .jj-win svg{width:100%;height:100%;}
        .jj-scroll::-webkit-scrollbar{width:5px;}
        .jj-scroll::-webkit-scrollbar-track{background:transparent;}
        .jj-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:3px;}
        .jj-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.25);}
        .jj-orb{position:absolute;border-radius:50%;filter:blur(55px);opacity:.45;pointer-events:none;animation:jj-orb 12s ease-in-out infinite;}
        .jj-glass{background:rgba(255,255,255,.05);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.08);}
        .jj-btn{background:linear-gradient(135deg,#4aa8ff,#8b5cf6);border:none;color:#fff;cursor:pointer;font-weight:700;border-radius:10px;transition:all .25s cubic-bezier(.16,1,.3,1);display:inline-flex;align-items:center;justify-content:center;gap:6px;}
        .jj-btn:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(74,168,255,.4);}
        .jj-btn:active{transform:translateY(0);}
        .jj-btn-ghost{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.7);cursor:pointer;border-radius:8px;transition:all .2s;display:inline-flex;align-items:center;justify-content:center;gap:5px;}
        .jj-btn-ghost:hover{background:rgba(255,255,255,.12);color:#fff;}
        .jj-input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#e8f0ff;border-radius:10px;outline:none;transition:all .25s;font-family:inherit;}
        .jj-input:focus{border-color:rgba(74,168,255,.55);box-shadow:0 0 0 3px rgba(74,168,255,.12);background:rgba(255,255,255,.08);}
        .jj-input::placeholder{color:rgba(255,255,255,.3);}
        .jj-nav{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,.45);transition:all .25s cubic-bezier(.16,1,.3,1);}
        .jj-nav:hover{background:rgba(74,168,255,.12);color:#4aa8ff;transform:scale(1.06);}
        .jj-nav.active{background:linear-gradient(135deg,rgba(74,168,255,.22),rgba(139,92,246,.18));color:#4aa8ff;}
        .jj-list-item{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);transition:all .2s;}
        .jj-list-item:hover{background:rgba(74,168,255,.07);}
        .jj-list-item.active{background:linear-gradient(90deg,rgba(74,168,255,.14),transparent);border-left:3px solid #4aa8ff;padding-left:9px;}
        .jj-msg{display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;animation:jj-slide-up .3s cubic-bezier(.16,1,.3,1) both;}
        .jj-msg.me{flex-direction:row-reverse;}
        .jj-avatar{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;flex-shrink:0;box-shadow:0 3px 10px rgba(0,0,0,.3);}
        .jj-bubble{padding:9px 13px;border-radius:12px;font-size:13px;line-height:1.5;word-break:break-word;max-width:100%;text-align:left;}
        .jj-bubble.me{background:linear-gradient(135deg,#4aa8ff,#3a7fd4);color:#fff;border-bottom-right-radius:4px;}
        .jj-bubble.other{background:rgba(255,255,255,.07);color:#e8f0ff;border:1px solid rgba(255,255,255,.07);border-bottom-left-radius:4px;}
        .jj-title-btn{width:30px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:6px;color:rgba(255,255,255,.6);transition:all .2s;}
        .jj-title-btn:hover{background:rgba(255,255,255,.12);color:#fff;}
        .jj-title-btn.close:hover{background:#ff4757;color:#fff;}
        .jj-badge{background:linear-gradient(135deg,#ff6b6b,#ff4757);color:#fff;font-size:10px;border-radius:10px;padding:2px 7px;min-width:17px;text-align:center;font-weight:700;flex-shrink:0;}
        .jj-tag{font-size:10px;padding:2px 8px;border-radius:10px;font-weight:600;}
        .jj-divider{height:1px;background:rgba(255,255,255,.06);margin:4px 0;}
        .jj-anim-float{animation:jj-float 5s ease-in-out infinite;}
        .jj-anim-glow{animation:jj-glow 3s ease-in-out infinite;}
        .jj-anim-scale{animation:jj-scale-in .35s cubic-bezier(.16,1,.3,1) both;}
        .jj-gradient-text{background:linear-gradient(90deg,#4aa8ff,#8b5cf6,#39e7ff);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:jj-shimmer 4s ease infinite;}
        .jj-online-dot{width:8px;height:8px;border-radius:50%;background:#4ecdc4;box-shadow:0 0 6px #4ecdc4;flex-shrink:0;}
        .jj-online-dot.offline{background:rgba(255,255,255,.2);box-shadow:none;}
        .jj-bot-card{padding:10px;border-radius:10px;margin-bottom:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);}
        .jj-bot-key{font-family:monospace;font-size:10px;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.3);color:#39e7ff;word-break:break-all;cursor:pointer;user-select:all;}
      `;
      this._shadow.appendChild(s);
    }

    _buildWindow() {
      const wrap=document.createElement('div');
      wrap.className='jj-win';
      wrap.id='jj-window';
      wrap.style.cssText='display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:'+WIN_W+'px;height:'+WIN_H+'px;border-radius:16px;overflow:hidden;flex-direction:column;background:linear-gradient(135deg,#0a0e1a 0%,#111827 50%,#0f172a 100%);box-shadow:0 25px 70px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.08);pointer-events:auto;';
      wrap.innerHTML=`
        <div class="jj-orb" style="width:280px;height:280px;background:#4aa8ff;top:-70px;left:-50px;"></div>
        <div class="jj-orb" style="width:230px;height:230px;background:#8b5cf6;bottom:-50px;right:-30px;animation-delay:-4s;"></div>
        <div class="jj-orb" style="width:180px;height:180px;background:#39e7ff;top:35%;right:25%;animation-delay:-8s;opacity:.25;"></div>
        <div id="jj-titlebar" style="display:flex;align-items:center;justify-content:space-between;height:40px;padding:0 12px;cursor:move;position:relative;z-index:5;background:rgba(10,14,26,.55);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.06);">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#4aa8ff,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;" class="jj-anim-glow">${icon('logo',15)}</div>
            <span style="font-weight:700;font-size:13px;" class="jj-gradient-text">JunjunChat</span>
          </div>
          <div style="display:flex;gap:4px;">
            <div class="jj-title-btn" id="jj-min">${icon('minus',14)}</div>
            <div class="jj-title-btn" id="jj-full">${icon('maximize',13)}</div>
            <div class="jj-title-btn close" id="jj-close">${icon('x',14)}</div>
          </div>
        </div>
        <div style="flex:1;display:flex;overflow:hidden;position:relative;z-index:2;">
          <div id="jj-login-panel" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:10;">
            <div class="jj-glass jj-anim-scale" style="width:370px;border-radius:18px;padding:32px 28px;position:relative;">
              <div style="text-align:center;margin-bottom:22px;" class="jj-anim-float">
                <div style="width:58px;height:58px;border-radius:16px;margin:0 auto 12px;background:linear-gradient(135deg,#4aa8ff,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 8px 25px rgba(74,168,255,.45);">${icon('logo',28)}</div>
                <div style="font-size:20px;font-weight:800;" class="jj-gradient-text">JunjunChat</div>
                <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:5px;letter-spacing:2px;">随时随地，你我都在</div>
              </div>
              <div id="jj-login-form">
                <input id="jj-li-user" class="jj-input" type="text" placeholder="用户名" style="width:100%;height:40px;padding:0 12px;margin-bottom:10px;font-size:13px;" />
                <input id="jj-li-pass" class="jj-input" type="password" placeholder="密码" style="width:100%;height:40px;padding:0 12px;margin-bottom:14px;font-size:13px;" />
                <button id="jj-li-btn" class="jj-btn" style="width:100%;height:40px;font-size:13px;letter-spacing:3px;">登 录</button>
                <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12px;">
                  <span id="jj-to-reg" style="color:#4aa8ff;cursor:pointer;">注册账号</span>
                </div>
              </div>
              <div id="jj-reg-form" style="display:none;">
                <input id="jj-re-user" class="jj-input" type="text" placeholder="用户名 (3-50位)" style="width:100%;height:38px;padding:0 12px;margin-bottom:8px;font-size:13px;" />
                <input id="jj-re-nick" class="jj-input" type="text" placeholder="昵称 (可选)" style="width:100%;height:38px;padding:0 12px;margin-bottom:8px;font-size:13px;" />
                <input id="jj-re-pass" class="jj-input" type="password" placeholder="密码 (至少6位)" style="width:100%;height:38px;padding:0 12px;margin-bottom:8px;font-size:13px;" />
                <input id="jj-re-pass2" class="jj-input" type="password" placeholder="确认密码" style="width:100%;height:38px;padding:0 12px;margin-bottom:12px;font-size:13px;" />
                <button id="jj-re-btn" class="jj-btn" style="width:100%;height:40px;font-size:13px;letter-spacing:3px;">注 册</button>
                <div style="text-align:center;margin-top:12px;font-size:12px;"><span id="jj-to-login" style="color:#4aa8ff;cursor:pointer;">返回登录</span></div>
              </div>
              <div id="jj-li-msg" style="margin-top:10px;font-size:12px;color:#ff6b6b;text-align:center;min-height:16px;"></div>
            </div>
          </div>
          <div id="jj-main" style="display:none;width:100%;height:100%;">
            <div style="width:56px;background:rgba(10,14,26,.65);backdrop-filter:blur(16px);display:flex;flex-direction:column;align-items:center;padding-top:12px;gap:5px;border-right:1px solid rgba(255,255,255,.05);">
              <div id="jj-avatar" style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#4aa8ff,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:8px;box-shadow:0 4px 12px rgba(74,168,255,.3);">?</div>
              <div class="jj-nav active" data-tab="chat" title="消息">${icon('message',18)}</div>
              <div class="jj-nav" data-tab="friends" title="联系人">${icon('users',18)}</div>
              <div class="jj-nav" data-tab="groups" title="群聊">${icon('group',18)}</div>
              <div class="jj-nav" data-tab="bots" title="机器人">${icon('bot',18)}</div>
              <div style="flex:1;"></div>
              <div class="jj-nav" id="jj-logout" title="退出登录">${icon('logout',18)}</div>
            </div>
            <div style="width:240px;background:rgba(15,21,37,.5);backdrop-filter:blur(10px);display:flex;flex-direction:column;border-right:1px solid rgba(255,255,255,.04);">
              <div style="height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.05);">
                <span id="jj-list-title" style="font-weight:700;font-size:13px;">消息</span>
                <div id="jj-list-add" class="jj-nav" style="width:28px;height:28px;" title="添加">${icon('plus',15)}</div>
              </div>
              <div id="jj-search-box" style="padding:8px;display:none;">
                <div style="position:relative;">
                  <span style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,.3);display:flex;">${icon('search',14)}</span>
                  <input id="jj-search-input" class="jj-input" type="text" placeholder="搜索..." style="width:100%;height:30px;padding:0 10px 0 30px;font-size:12px;border-radius:15px;" />
                </div>
              </div>
              <div id="jj-list" class="jj-scroll" style="flex:1;overflow-y:auto;"></div>
            </div>
            <div id="jj-chat-panel" style="flex:1;display:flex;flex-direction:column;min-width:0;background:rgba(10,14,26,.35);">
              <div style="height:44px;display:flex;align-items:center;padding:0 16px;border-bottom:1px solid rgba(255,255,255,.05);">
                <span id="jj-chat-title" style="font-weight:700;font-size:13px;background:linear-gradient(90deg,#fff,#a8c8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">选择一个会话开始聊天</span>
              </div>
              <div id="jj-msgs" class="jj-scroll" style="flex:1;overflow-y:auto;padding:14px 16px;"></div>
              <div style="border-top:1px solid rgba(255,255,255,.05);padding:8px 12px;background:rgba(10,14,26,.45);">
                <div style="display:flex;gap:8px;align-items:flex-end;">
                  <textarea id="jj-input" class="jj-input" placeholder="输入消息，Enter发送..." style="flex:1;height:60px;padding:9px 12px;font-size:13px;resize:none;border-radius:10px;font-family:inherit;"></textarea>
                  <button id="jj-send" class="jj-btn" style="width:64px;height:60px;font-size:12px;border-radius:10px;">${icon('send',16)}</button>
                </div>
              </div>
            </div>
            <div id="jj-empty" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,.2);">
              <div style="width:60px;height:60px;border-radius:16px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;margin-bottom:10px;" class="jj-anim-float">${icon('message',28)}</div>
              <div style="font-size:13px;">选择一个会话开始聊天</div>
            </div>
          </div>
          <div id="jj-modal" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);z-index:20;align-items:center;justify-content:center;">
            <div class="jj-glass jj-anim-scale" style="border-radius:14px;padding:20px;width:330px;">
              <div id="jj-modal-title" style="font-weight:700;font-size:14px;margin-bottom:12px;" class="jj-gradient-text"></div>
              <div id="jj-modal-body"></div>
              <div id="jj-modal-msg" style="margin-top:8px;font-size:12px;color:#ff6b6b;min-height:16px;"></div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
                <button id="jj-modal-cancel" class="jj-btn-ghost" style="padding:7px 16px;font-size:12px;">取消</button>
                <button id="jj-modal-ok" class="jj-btn" style="padding:7px 16px;font-size:12px;">确定</button>
              </div>
            </div>
          </div>
        </div>
      `;
      this._shadow.appendChild(wrap);
      this._win=wrap;
      this._bindEvents();
    }

    _$(sel){return this._shadow.querySelector(sel);}
    _$$(sel){return this._shadow.querySelectorAll(sel);}

    _bindEvents() {
      const w=this._win;
      this._$('#jj-close').onclick=()=>this._hide();
      this._$('#jj-min').onclick=()=>this._hide();
      this._$('#jj-full').onclick=()=>this._toggleFullscreen();
      let drag=false,ox=0,oy=0;
      const tb=this._$('#jj-titlebar');
      tb.onmousedown=(e)=>{ if(e.target.closest('.jj-title-btn'))return; drag=true; const r=w.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; w.style.transform='none'; };
      document.addEventListener('mousemove',(e)=>{ if(!drag)return; w.style.left=(e.clientX-ox)+'px'; w.style.top=(e.clientY-oy)+'px'; });
      document.addEventListener('mouseup',()=>{drag=false;});
      this._$('#jj-to-reg').onclick=()=>{ this._$('#jj-login-form').style.display='none'; this._$('#jj-reg-form').style.display='block'; this._$('#jj-li-msg').textContent=''; };
      this._$('#jj-to-login').onclick=()=>{ this._$('#jj-login-form').style.display='block'; this._$('#jj-reg-form').style.display='none'; this._$('#jj-li-msg').textContent=''; };
      this._$('#jj-li-btn').onclick=()=>this._doLogin();
      this._$('#jj-li-pass').onkeydown=(e)=>{if(e.key==='Enter')this._doLogin();};
      this._$('#jj-re-btn').onclick=()=>this._doRegister();
      this._$$('.jj-nav[data-tab]').forEach(it=>{ it.onclick=()=>this._switchTab(it.dataset.tab); });
      this._$('#jj-logout').onclick=()=>this._doLogout();
      this._$('#jj-send').onclick=()=>this._doSend();
      this._$('#jj-input').onkeydown=(e)=>{ if(e.key==='Enter'&&!e.ctrlKey&&!e.shiftKey){e.preventDefault();this._doSend();} };
      this._$('#jj-list-add').onclick=()=>this._handleListAdd();
      this._$('#jj-search-input').oninput=(e)=>this._filterList(e.target.value);
      this._$('#jj-modal-cancel').onclick=()=>this._closeModal();
      this._$('#jj-modal-ok').onclick=()=>this._modalOk();
      // 阻止所有输入框的键盘事件冒泡到 CCW 编辑器（修复 backspace 用不了）
      this._shadow.addEventListener('keydown',(e)=>{
        if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'){
          e.stopPropagation();
        }
      },true);
    }

    // ========== 拓展信息 ==========
    getInfo() {
      return {
        id:EXT_ID, name:'JunjunChat',
        color1:'#4aa8ff', color2:'#3a7fd4', color3:'#2a5faa',
        blocks:[
          {opcode:'openWindow',blockType:Scratch.BlockType.COMMAND,text:'打开 JunjunChat 窗口'},
          {opcode:'closeWindow',blockType:Scratch.BlockType.COMMAND,text:'关闭 JunjunChat 窗口'},
          {opcode:'minimizeWindow',blockType:Scratch.BlockType.COMMAND,text:'最小化 JunjunChat 窗口'},
          {opcode:'toggleFullscreen',blockType:Scratch.BlockType.COMMAND,text:'全屏/还原 JunjunChat 窗口'},
          '---',
          {opcode:'isLoggedIn',blockType:Scratch.BlockType.BOOLEAN,text:'当前是否已登录'},
          {opcode:'currentUsername',blockType:Scratch.BlockType.REPORTER,text:'当前用户名'},
          {opcode:'unreadCount',blockType:Scratch.BlockType.REPORTER,text:'未读消息数量'},
          '---',
          {opcode:'onNewMessage',blockType:Scratch.BlockType.HAT,text:'当收到新消息时',isEdgeActivated:false},
          '---',
          {opcode:'recommendGroup',blockType:Scratch.BlockType.COMMAND,text:'推荐添加群聊 [GROUP_ID] 附加消息 [EXTRA]',arguments:{GROUP_ID:{type:Scratch.ArgumentType.STRING,defaultValue:''},EXTRA:{type:Scratch.ArgumentType.STRING,defaultValue:''}}},
          {opcode:'hasJoinedGroup',blockType:Scratch.BlockType.BOOLEAN,text:'是否已加入群聊 [GROUP_ID]',arguments:{GROUP_ID:{type:Scratch.ArgumentType.STRING,defaultValue:''}}},
          '---',
          {opcode:'setBotKey',blockType:Scratch.BlockType.COMMAND,text:'设置机器人 Key [KEY]',arguments:{KEY:{type:Scratch.ArgumentType.STRING,defaultValue:''}}},
          {opcode:'connectBot',blockType:Scratch.BlockType.COMMAND,text:'连接机器人实时消息'},
          {opcode:'disconnectBot',blockType:Scratch.BlockType.COMMAND,text:'断开机器人实时消息'},
          {opcode:'isBotConnected',blockType:Scratch.BlockType.BOOLEAN,text:'机器人是否已连接'},
          '---',
          {opcode:'onBotMessage',blockType:Scratch.BlockType.HAT,text:'当机器人收到消息时',isEdgeActivated:false},
          {opcode:'onBotMention',blockType:Scratch.BlockType.HAT,text:'当机器人被@时',isEdgeActivated:false},
          '---',
          {opcode:'msgSender',blockType:Scratch.BlockType.REPORTER,text:'消息发送者'},
          {opcode:'msgSenderId',blockType:Scratch.BlockType.REPORTER,text:'消息发送者ID'},
          {opcode:'msgConversationId',blockType:Scratch.BlockType.REPORTER,text:'消息会话ID'},
          {opcode:'msgContent',blockType:Scratch.BlockType.REPORTER,text:'消息内容'},
          '---',
          {opcode:'botSendMessage',blockType:Scratch.BlockType.COMMAND,text:'机器人向会话 [GROUP_ID] 发送消息 [MESSAGE]',arguments:{GROUP_ID:{type:Scratch.ArgumentType.STRING,defaultValue:''},MESSAGE:{type:Scratch.ArgumentType.STRING,defaultValue:'你好'}}},
          {opcode:'botSendDM',blockType:Scratch.BlockType.COMMAND,text:'机器人向用户 [USER_ID] 发送私信 [MESSAGE]',arguments:{USER_ID:{type:Scratch.ArgumentType.STRING,defaultValue:''},MESSAGE:{type:Scratch.ArgumentType.STRING,defaultValue:'你好'}}}
        ],
        menus:{}
      };
    }

    // ========== 窗口积木 ==========
    openWindow(){this._show();}
    closeWindow(){this._hide();}
    minimizeWindow(){this._hide();}
    toggleFullscreen(){this._toggleFullscreen();}
    _show(){
      if(!this._win)return;
      this._win.style.display='flex'; this._visible=true;
      this._win.classList.add('jj-anim-scale');
      setTimeout(()=>this._win.classList.remove('jj-anim-scale'),400);
      if(this.currentUser){this._refreshConvs();this._connectUserWs();}
    }
    _hide(){ if(this._win){this._win.style.display='none';this._visible=false;} }
    _toggleFullscreen(){
      if(!this._win)return;
      if(this._fullscreen){
        this._win.style.width=WIN_W+'px';this._win.style.height=WIN_H+'px';
        this._win.style.left='50%';this._win.style.top='50%';this._win.style.transform='translate(-50%,-50%)';
        this._win.style.borderRadius='16px'; this._fullscreen=false;
      } else {
        this._win.style.width='100vw';this._win.style.height='100vh';
        this._win.style.left='0';this._win.style.top='0';this._win.style.transform='none';
        this._win.style.borderRadius='0'; this._fullscreen=true;
      }
    }

    // ========== 状态积木 ==========
    isLoggedIn(){return !!this.currentUser;}
    currentUsername(){return (this.currentUser&&(this.currentUser.nickname||this.currentUser.username))||'';}
    unreadCount(){return this._unread||0;}
    onNewMessage(){return true;}

    // ========== 群聊积木 ==========
    recommendGroup(args){
      const gid=Scratch.Cast.toString(args.GROUP_ID).trim(), extra=Scratch.Cast.toString(args.EXTRA);
      if(!gid)return; this._show(); this._showRecommendModal(gid,extra);
    }
    async hasJoinedGroup(args){
      const gid=Scratch.Cast.toString(args.GROUP_ID).trim();
      if(!gid||!this.currentUser)return false;
      if(this.joinedGroups[gid]!==undefined)return this.joinedGroups[gid];
      try{const list=await this.api.conversations();const f=(list||[]).some(c=>String(c.id)===String(gid));this.joinedGroups[gid]=f;return f;}catch(e){return false;}
    }

    // ========== 机器人积木 ==========
    async setBotKey(args){
      const key=Scratch.Cast.toString(args.KEY).trim();
      if(!key)return;
      this.botKey=key; this._botConnected=false;
      try{
        const info=await this.api.botMe(key);
        if(info&&(info.bot||info.id)){this.botInfo=info.bot||info;this.botUserId=info.user_id||(info.bot&&info.bot.user_id)||null;this._botConnected=true;}
      }catch(e){console.error('[JunjunChat] bot key error:',e.message);this._botConnected=false;}
    }
    connectBot(){if(this.botKey)this._connectBotWs();}
    disconnectBot(){this._botManualDisconnect=true;this.botKey=null;this._closeBotWs();}
    isBotConnected(){return this._botConnected;}
    onBotMessage(){return true;}
    onBotMention(){return true;}
    msgSender(){return this.lastMsg.sender;}
    msgSenderId(){return this.lastMsg.senderId;}
    msgConversationId(){return this.lastMsg.conversationId;}
    msgContent(){return this.lastMsg.content;}
    async botSendMessage(args){
      const gid=Scratch.Cast.toString(args.GROUP_ID).trim(),msg=Scratch.Cast.toString(args.MESSAGE);
      if(!this.botKey||!gid||!msg)return;
      try{await this.api.botSendMessage(this.botKey,gid,msg);}catch(e){console.error('[JunjunChat] send fail:',e.message);}
    }
    async botSendDM(args){
      const uid=Scratch.Cast.toString(args.USER_ID).trim(),msg=Scratch.Cast.toString(args.MESSAGE);
      if(!this.botKey||!uid||!msg)return;
      try{await this.api.botSendDM(this.botKey,uid,msg);}catch(e){console.error('[JunjunChat] dm fail:',e.message);}
    }

    // ========== 机器人 WebSocket ==========
    _connectBotWs() {
      if(!this.botKey)return;
      if(this.botWs&&(this.botWs.readyState===WebSocket.OPEN||this.botWs.readyState===WebSocket.CONNECTING))return;
      this._botManualDisconnect=false;
      try{this.botWs=new WebSocket(WS_BASE+'/bot/ws?key='+encodeURIComponent(this.botKey));}catch(e){this._scheduleBotReconnect();return;}
      this.botWs.onopen=()=>{this._botReconnectAttempt=0;this._botConnected=true;this._startBotHeartbeat();};
      this.botWs.onmessage=(evt)=>{
        if(evt.data==='pong'){if(this._botPongTimer){clearTimeout(this._botPongTimer);this._botPongTimer=null;}return;}
        try{
          const msg=JSON.parse(evt.data);
          if(msg.type==='message.created'&&msg.data){
            const d=msg.data;
            const sender=d.sender||{};
            this.lastMsg={sender:sender.nickname||sender.username||'',senderId:d.sender_id||'',conversationId:d.conversation_id||'',content:d.content||''};
            if(this.runtime&&this.runtime.startHats)this.runtime.startHats(EXT_ID+'_onBotMessage');
            if(d.content&&d.content.includes('@')){
              this.lastAt={sender:sender.nickname||sender.username||'',senderId:d.sender_id||'',conversationId:d.conversation_id||'',content:d.content||''};
              if(this.runtime&&this.runtime.startHats)this.runtime.startHats(EXT_ID+'_onBotMention');
            }
          }
        }catch(e){}
      };
      this.botWs.onclose=()=>{this._botConnected=false;if(!this._botManualDisconnect)this._scheduleBotReconnect();};
      this.botWs.onerror=()=>{if(this.botWs)this.botWs.close();};
    }
    _closeBotWs(){if(this._botPingId){clearInterval(this._botPingId);this._botPingId=null;}if(this._botPongTimer){clearTimeout(this._botPongTimer);this._botPongTimer=null;}if(this.botWs){try{this.botWs.close();}catch(e){}this.botWs=null;}this._botConnected=false;}
    _startBotHeartbeat(){if(this._botPingId)clearInterval(this._botPingId);this._botPingId=setInterval(()=>{if(this.botWs&&this.botWs.readyState===WebSocket.OPEN){this.botWs.send('ping');this._botPongTimer=setTimeout(()=>{if(this.botWs)this.botWs.close();},PONG_TIMEOUT_MS);}},HEARTBEAT_MS);}
    _scheduleBotReconnect(){this._botReconnectAttempt++;const delay=Math.min(RECONNECT_BASE*Math.pow(2,this._botReconnectAttempt-1),RECONNECT_MAX)+Math.random()*RECONNECT_JITTER;this._botReconnectTimer=setTimeout(()=>this._connectBotWs(),delay);}

    // ========== 用户 WebSocket ==========
    _connectUserWs() {
      if(!this.api.token)return;
      if(this.userWs&&(this.userWs.readyState===WebSocket.OPEN||this.userWs.readyState===WebSocket.CONNECTING))return;
      try{this.userWs=new WebSocket(WS_BASE+'/ws?token='+encodeURIComponent(this.api.token));}catch(e){this._scheduleUserReconnect();return;}
      this.userWs.onopen=()=>{this._userReconnectAttempt=0;this._startUserHeartbeat();};
      this.userWs.onmessage=(evt)=>{
        if(evt.data==='pong'){if(this._userPongTimer){clearTimeout(this._userPongTimer);this._userPongTimer=null;}return;}
        try{
          const msg=JSON.parse(evt.data);
          if(msg.type==='message.created'&&msg.data){
            const d=msg.data;
            this._unread++;
            if(this._activeConv&&String(this._activeConv.id)===String(d.conversation_id)){
              if(!this._msgCache[d.conversation_id])this._msgCache[d.conversation_id]=[];
              this._msgCache[d.conversation_id].push(d);
              this._renderMessages();
            }
            this._refreshConvs();
            if(this.runtime&&this.runtime.startHats)this.runtime.startHats(EXT_ID+'_onNewMessage');
          }
        }catch(e){}
      };
      this.userWs.onclose=()=>{this._scheduleUserReconnect();};
      this.userWs.onerror=()=>{if(this.userWs)this.userWs.close();};
    }
    _closeUserWs(){if(this._userPingId){clearInterval(this._userPingId);this._userPingId=null;}if(this._userPongTimer){clearTimeout(this._userPongTimer);this._userPongTimer=null;}if(this.userWs){try{this.userWs.close();}catch(e){}this.userWs=null;}}
    _startUserHeartbeat(){if(this._userPingId)clearInterval(this._userPingId);this._userPingId=setInterval(()=>{if(this.userWs&&this.userWs.readyState===WebSocket.OPEN){this.userWs.send('ping');this._userPongTimer=setTimeout(()=>{if(this.userWs)this.userWs.close();},PONG_TIMEOUT_MS);}},HEARTBEAT_MS);}
    _scheduleUserReconnect(){this._userReconnectAttempt++;const delay=Math.min(RECONNECT_BASE*Math.pow(2,this._userReconnectAttempt-1),RECONNECT_MAX)+Math.random()*RECONNECT_JITTER;this._userReconnectTimer=setTimeout(()=>this._connectUserWs(),delay);}

    // ========== 登录注册 ==========
    async _doLogin(){
      const u=this._$('#jj-li-user').value.trim(),p=this._$('#jj-li-pass').value;
      if(!u||!p){this._$('#jj-li-msg').textContent='请输入用户名和密码';return;}
      this._$('#jj-li-msg').textContent='';
      try{
        const data=await this.api.login(u,p);
        this.api.setToken(data.access_token);this.currentUser=data.user;
        this._$('#jj-login-panel').style.display='none';
        this._$('#jj-main').style.display='flex';
        this._$('#jj-avatar').textContent=avatarText(this.currentUser.nickname||this.currentUser.username);
        this._$('#jj-avatar').style.background='linear-gradient(135deg,'+avatarColor(this.currentUser.username)+','+avatarColor(this.currentUser.username+'x')+')';
        this._refreshConvs();this._connectUserWs();
      }catch(e){this._$('#jj-li-msg').textContent=e.message;}
    }
    async _doRegister(){
      const u=this._$('#jj-re-user').value.trim(),n=this._$('#jj-re-nick').value.trim(),p=this._$('#jj-re-pass').value,p2=this._$('#jj-re-pass2').value;
      if(!u||!p){this._$('#jj-li-msg').textContent='请填写用户名和密码';return;}
      if(p!==p2){this._$('#jj-li-msg').textContent='两次密码不一致';return;}
      if(p.length<6){this._$('#jj-li-msg').textContent='密码至少6位';return;}
      this._$('#jj-li-msg').textContent='';
      try{
        const data=await this.api.register(u,p,n);
        this.api.setToken(data.access_token);this.currentUser=data.user;
        this._$('#jj-login-panel').style.display='none';
        this._$('#jj-main').style.display='flex';
        this._$('#jj-avatar').textContent=avatarText(this.currentUser.nickname||this.currentUser.username);
        this._$('#jj-avatar').style.background='linear-gradient(135deg,'+avatarColor(this.currentUser.username)+','+avatarColor(this.currentUser.username+'x')+')';
        this._refreshConvs();this._connectUserWs();
      }catch(e){this._$('#jj-li-msg').textContent=e.message;}
    }
    _doLogout(){
      this._closeUserWs();this.api.setToken(null);this.currentUser=null;this._activeConv=null;this._convList=[];this._msgCache={};
      this._$('#jj-main').style.display='none';this._$('#jj-login-panel').style.display='flex';
      this._$('#jj-li-user').value='';this._$('#jj-li-pass').value='';
    }

    // ========== 标签切换 ==========
    _switchTab(tab){
      this._currentTab=tab;
      this._$$('.jj-nav[data-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.tab===tab);});
      const titles={chat:'消息',friends:'联系人',groups:'群聊',bots:'机器人'};
      this._$('#jj-list-title').textContent=titles[tab];
      this._$('#jj-search-box').style.display=(tab==='friends'||tab==='chat')?'block':'none';
      this._$('#jj-search-input').value='';
      this._renderList();
      if(tab==='friends')this._refreshFriends();
      if(tab==='bots')this._refreshBots();
    }
    _filterList(q){this._renderList(q);}

    // ========== 渲染列表 ==========
    async _refreshConvs(){try{this._convList=await this.api.conversations();}catch(e){this._convList=[];}this._renderList();}
    async _refreshFriends(){try{this._friendList=await this.api.friends();}catch(e){this._friendList=[];}this._renderList();}
    async _refreshBots(){try{this._bots=await this.api.myBots();}catch(e){this._bots=[];}this._renderList();}

    _renderList(filter){
      const box=this._$('#jj-list');if(!box)return;box.innerHTML='';
      if(this._currentTab==='chat')this._renderConvList(box,filter);
      else if(this._currentTab==='friends')this._renderFriendList(box,filter);
      else if(this._currentTab==='groups')this._renderGroupList(box);
      else if(this._currentTab==='bots')this._renderBotList(box);
    }
    _renderConvList(box,filter){
      let list=this._convList||[];
      if(filter)list=list.filter(c=>(c.title||'').toLowerCase().includes(filter.toLowerCase()));
      if(!list.length){box.innerHTML='<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);font-size:12px;">暂无会话</div>';return;}
      list.forEach(c=>{
        const item=document.createElement('div');
        item.className='jj-list-item'+(this._activeConv&&this._activeConv.id===c.id?' active':'');
        const lastMsg=c.last_message?c.last_message.content:'';
        item.innerHTML='<div class="jj-avatar" style="background:linear-gradient(135deg,'+avatarColor(c.title)+','+avatarColor(c.title+'x')+')">'+esc(avatarText(c.title))+'</div><div class="jj-list-item" style="flex:1;border:none;padding:0;"><div style="font-size:13px;font-weight:600;">'+esc(c.title||'会话')+'</div><div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px;">'+esc(lastMsg||'暂无消息')+'</div></div>'+(c.type==='group'?'<span style="font-size:10px;color:rgba(255,255,255,.3);">群</span>':'');
        item.onclick=()=>this._openConv(c);
        box.appendChild(item);
      });
    }
    _renderFriendList(box,filter){
      let list=this._friendList||[];
      if(filter)list=list.filter(f=>(f.nickname||f.username||'').toLowerCase().includes(filter.toLowerCase()));
      if(!list.length){box.innerHTML='<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);font-size:12px;">暂无好友<br>点右上角+添加</div>';return;}
      list.forEach(f=>{
        const item=document.createElement('div');item.className='jj-list-item';
        item.innerHTML='<div class="jj-avatar" style="background:linear-gradient(135deg,'+avatarColor(f.username)+','+avatarColor(f.username+'x')+')">'+esc(avatarText(f.nickname||f.username))+'</div><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(f.nickname||f.username)+'</div><div style="font-size:11px;color:rgba(255,255,255,.4);">@'+esc(f.username)+'</div></div><div class="jj-online-dot '+(f.status==='online'?'':'offline')+'"></div>';
        item.onclick=async()=>{try{const conv=await this.api.createDirect(f.id);await this._refreshConvs();const c=this._convList.find(x=>x.id===conv.id);if(c)this._openConv(c);}catch(e){}};
        box.appendChild(item);
      });
    }
    _renderGroupList(box){
      const groups=(this._convList||[]).filter(c=>c.type==='group');
      if(!groups.length){box.innerHTML='<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);font-size:12px;">暂无群聊<br>点右上角+创建或加入</div>';return;}
      groups.forEach(c=>{
        const item=document.createElement('div');item.className='jj-list-item'+(this._activeConv&&this._activeConv.id===c.id?' active':'');
        item.innerHTML='<div class="jj-avatar" style="background:linear-gradient(135deg,'+avatarColor(c.title)+','+avatarColor(c.title+'x')+')">'+esc(avatarText(c.title))+'</div><div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;">'+esc(c.title)+'</div><div style="font-size:11px;color:rgba(255,255,255,.4);">'+(c.member_count||0)+' 人</div></div>';
        item.onclick=()=>this._openConv(c);
        box.appendChild(item);
      });
    }
    _renderBotList(box){
      const bots=this._bots||[];
      if(!bots.length){box.innerHTML='<div style="padding:30px;text-align:center;color:rgba(255,255,255,.3);font-size:12px;">暂无机器人<br>点右上角+创建</div>';return;}
      bots.forEach(b=>{
        const card=document.createElement('div');card.className='jj-bot-card';
        card.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><div class="jj-avatar" style="background:linear-gradient(135deg,#8b5cf6,#4aa8ff);width:30px;height:30px;font-size:11px;">B</div><div style="flex:1;"><div style="font-size:12px;font-weight:600;">'+esc(b.name)+'</div><div style="font-size:9px;color:rgba(255,255,255,.4);">ID: '+b.id+'</div></div><span style="font-size:9px;padding:1px 6px;border-radius:6px;font-weight:600;'+(b.is_online?'background:rgba(78,205,196,.15);color:#4ecdc4;':'background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);')+'">'+(b.is_online?'在线':'离线')+'</span></div><div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:3px;">Bot Key:</div><div class="jj-bot-key">'+esc(b.bot_key)+'</div>';
        box.appendChild(card);
      });
    }

    // ========== 打开会话 ==========
    async _openConv(conv){
      this._activeConv=conv;
      this._$('#jj-chat-title').textContent=conv.title||'会话';
      this._$('#jj-empty').style.display='none';
      this._$('#jj-chat-panel').style.display='flex';
      this._renderList();
      if(!this._msgCache[conv.id]){try{this._msgCache[conv.id]=await this.api.messages(conv.id);}catch(e){this._msgCache[conv.id]=[];}}
      this._renderMessages();
    }
    _renderMessages(){
      const box=this._$('#jj-msgs');if(!box||!this._activeConv)return;
      const msgs=this._msgCache[this._activeConv.id]||[];
      box.innerHTML='';
      msgs.forEach(m=>{
        const isMe=this.currentUser&&String(m.sender_id)===String(this.currentUser.id);
        const sender=m.sender||{};
        const name=sender.nickname||sender.username||'用户';
        const row=document.createElement('div');row.className='jj-msg'+(isMe?' me':' other');
        row.innerHTML='<div class="jj-avatar" style="background:linear-gradient(135deg,'+avatarColor(name)+','+avatarColor(name+'x')+')">'+esc(avatarText(name))+'</div><div>'+(!isMe?'<div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:2px;">'+esc(name)+'</div>':'')+'<div class="jj-bubble '+(isMe?'me':'other')+'">'+esc(m.content)+'</div><div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:3px;text-align:'+(isMe?'right':'left')+';">'+formatTime(m.created_at)+'</div></div>';
        box.appendChild(row);
      });
      box.scrollTop=box.scrollHeight;
    }

    // ========== 发送消息 ==========
    async _doSend(){
      const input=this._$('#jj-input');
      const content=input.value.trim();
      if(!content||!this._activeConv)return;
      input.value='';
      try{
        const msg=await this.api.sendMessage(this._activeConv.id,content);
        if(!this._msgCache[this._activeConv.id])this._msgCache[this._activeConv.id]=[];
        this._msgCache[this._activeConv.id].push(msg);
        this._renderMessages();
        this._refreshConvs();
      }catch(e){input.value=content;}
    }

    // ========== 添加按钮 ==========
    _handleListAdd(){
      if(this._currentTab==='friends'||this._currentTab==='chat')this._showAddFriendModal();
      else if(this._currentTab==='groups')this._showGroupModal();
      else if(this._currentTab==='bots')this._showCreateBotModal();
    }

    // ========== 弹窗 ==========
    _showModal(title,bodyHTML,onOk){
      this._$('#jj-modal-title').textContent=title;
      this._$('#jj-modal-body').innerHTML=bodyHTML;
      this._$('#jj-modal-msg').textContent='';
      this._$('#jj-modal').style.display='flex';
      this._modalConfirm=onOk;
    }
    _closeModal(){this._$('#jj-modal').style.display='none';this._modalConfirm=null;}
    async _modalOk(){if(this._modalConfirm){const r=await this._modalConfirm();if(r!==false)this._closeModal();}else this._closeModal();}

    _showAddFriendModal(){
      this._showModal('添加好友','<input id="jj-m-search" class="jj-input" placeholder="输入用户名搜索" style="width:100%;height:36px;padding:0 10px;margin-bottom:8px;"><div id="jj-m-results" style="max-height:180px;overflow-y:auto;"></div>',null);
      const input=this._$('#jj-m-search');
      input.oninput=async(e)=>{
        const q=e.target.value.trim();const box=this._$('#jj-m-results');
        if(!q){box.innerHTML='';return;}
        try{
          const users=await this.api.searchUser(q);
          box.innerHTML=users.map(u=>'<div class="jj-list-item" style="border:none;" onclick="document.dispatchEvent(new CustomEvent(\'jj-add-friend\',{detail:'+u.id+'}))"><div class="jj-avatar" style="width:30px;height:30px;font-size:11px;background:linear-gradient(135deg,'+avatarColor(u.username)+','+avatarColor(u.username+'x')+')">'+esc(avatarText(u.nickname||u.username))+'</div><div style="flex:1;"><div style="font-size:12px;font-weight:600;">'+esc(u.nickname||u.username)+'</div><div style="font-size:10px;color:rgba(255,255,255,.4);">@'+esc(u.username)+'</div></div></div>').join('');
        }catch(err){box.innerHTML='<div style="padding:10px;color:rgba(255,255,255,.3);font-size:11px;">未找到用户</div>';}
      };
      const handler=async(e)=>{try{await this.api.sendFriendRequest(e.detail);this._closeModal();}catch(err){this._$('#jj-modal-msg').textContent=err.message;}};
      document.addEventListener('jj-add-friend',handler,{once:true});
    }

    _showGroupModal(){
      this._showModal('群聊操作','<div style="margin-bottom:8px;"><div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px;">创建新群聊</div><input id="jj-m-gname" class="jj-input" placeholder="群聊名称" style="width:100%;height:34px;padding:0 10px;"></div><div><div style="font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px;">加入已有群聊</div><input id="jj-m-gid" class="jj-input" placeholder="群聊ID (数字)" style="width:100%;height:34px;padding:0 10px;"></div>',async()=>{
        const name=this._$('#jj-m-gname').value.trim();
        const gid=this._$('#jj-m-gid').value.trim();
        try{
          if(name){const g=await this.api.createGroup(name);await this._refreshConvs();const c=this._convList.find(x=>x.id===g.id);if(c)this._openConv(c);}
          else if(gid){await this.api.joinGroup(parseInt(gid));await this._refreshConvs();}
        }catch(e){this._$('#jj-modal-msg').textContent=e.message;return false;}
      });
    }

    _showCreateBotModal(){
      this._showModal('创建机器人','<input id="jj-m-bname" class="jj-input" placeholder="机器人名称" style="width:100%;height:36px;padding:0 10px;margin-bottom:8px;"><input id="jj-m-bdesc" class="jj-input" placeholder="描述 (可选)" style="width:100%;height:36px;padding:0 10px;">',async()=>{
        const name=this._$('#jj-m-bname').value.trim();
        const desc=this._$('#jj-m-bdesc').value.trim();
        if(!name){this._$('#jj-modal-msg').textContent='请输入机器人名称';return false;}
        try{await this.api.createBot(name,desc);await this._refreshBots();}catch(e){this._$('#jj-modal-msg').textContent=e.message;return false;}
      });
    }

    _showRecommendModal(gid,extra){
      this._showModal('加入群聊','<div style="font-size:12px;color:rgba(255,255,255,.6);margin-bottom:8px;">群聊ID: <b style="color:#4aa8ff;">'+esc(gid)+'</b></div>'+(extra?'<div style="font-size:12px;color:rgba(255,255,255,.6);margin-bottom:8px;">'+esc(extra)+'</div>':''),async()=>{
        try{await this.api.joinGroup(parseInt(gid));await this._refreshConvs();this.joinedGroups[gid]=true;}catch(e){this._$('#jj-modal-msg').textContent=e.message;return false;}
      });
    }
  }

  // ========== 注册拓展 ==========
  global.JunjunChatExtension = JunjunChatExtension;
  if (typeof Scratch !== 'undefined' && Scratch.extensions) {
    Scratch.extensions.register(new JunjunChatExtension());
  }
})(typeof window !== 'undefined' ? window : this);
