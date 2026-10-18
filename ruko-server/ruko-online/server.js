// Ruko server: accounts, shared hats/games, sales, live game servers. No dependencies.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'data.json');
fs.mkdirSync(DIR,{recursive:true});
let D={users:{},sessions:{},hats:[],games:[],sales:{},likes:{}};
try{D=Object.assign(D,JSON.parse(fs.readFileSync(FILE,'utf8')))}catch(e){}
let dirty=0;const save=()=>{dirty=1};
const flush=()=>{if(!dirty)return;dirty=0;fs.writeFile(FILE+'.tmp',JSON.stringify(D),e=>{if(!e)fs.rename(FILE+'.tmp',FILE,()=>{})})};
setInterval(flush,2000);
process.on('SIGTERM',()=>{try{fs.writeFileSync(FILE,JSON.stringify(D))}catch(e){}process.exit(0)});
const INDEX=fs.readFileSync(path.join(__dirname,'public','index.html'));
const PRICE={r1:50,r2:120,r3:200,r4:400,r5:30,r6:80};
const rnd=n=>crypto.randomBytes(n).toString('hex');
const pubUser=u=>({name:u.name,coins:u.coins,owned:u.owned,worn:u.worn,av:u.av,admin:!!u.admin});
const hashPw=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const clamp=(v,a,b,d)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:d));
const col=c=>/^#[0-9a-fA-F]{6}$/.test(c)?c:'#888888';
const av=a=>a&&typeof a=='object'?{skin:col(a.skin),shirt:col(a.shirt),pants:col(a.pants),face:clamp(a.face,0,3,0)|0}:null;
const send=(res,c,o)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let s='';req.on('data',d=>{s+=d;if(s.length>200000){no();req.destroy()}});req.on('end',()=>ok(s))});
const who=req=>{const t=(req.headers.authorization||'').slice(7)||new URL(req.url,'http://x').searchParams.get('token'),k=D.sessions[t];return k&&D.users[k]&&!D.users[k].banned?D.users[k]:null};
const tries={},rooms={},lc=new Map(),chat=[];let cid=0;
// Admin account "Ruko": password comes from the ADMIN_PASSWORD environment variable (never stored in the code).
const AP=process.env.ADMIN_PASSWORD;
if(AP){const old=D.users.ruko||{name:'Ruko',coins:500,owned:['r1'],worn:'r1',av:null,earn:[]},s=old.salt||rnd(16);D.users.ruko=Object.assign(old,{name:'Ruko',admin:true,salt:s,hash:hashPw(AP,s)});save()}
else{if(D.users.ruko)D.users.ruko.admin=false;console.log('ADMIN_PASSWORD not set: the Ruko admin account is disabled.')}
const room=id=>rooms[id]||(rooms[id]={cl:new Map(),dirty:0});
http.createServer(async(req,res)=>{
 const p=new URL(req.url,'http://x').pathname;
 if(!p.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(INDEX)}
 let b={};if(req.method=='POST'){try{b=JSON.parse(await body(req)||'{}')}catch(e){return send(res,400,{error:'Bad request'})}}
 const me=who(req),need=()=>send(res,401,{error:'Please log in again.'});
 try{
 if(p=='/api/signup'||p=='/api/login'){
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0],now=Date.now();
  tries[ip]=(tries[ip]||[]).filter(t=>t>now-60000);if(tries[ip].length>=10)return send(res,429,{error:'Too many attempts. Wait a minute.'});tries[ip].push(now);
  const name=String(b.name||'').trim(),k=name.toLowerCase(),pw=String(b.pass||'');
  if(p=='/api/signup'){
   if(!/^\w{3,16}$/.test(name))return send(res,400,{error:'Username: 3-16 letters, numbers or underscores.'});
   if(k=='ruko')return send(res,400,{error:'That name is reserved.'});
   if(pw.length<6||pw.length>100)return send(res,400,{error:'Password needs 6+ characters.'});
   if(D.users[k])return send(res,400,{error:'Username taken.'});
   const salt=rnd(16);D.users[k]={name,salt,hash:hashPw(pw,salt),coins:500,owned:['r1'],worn:'r1',av:null,earn:[]};
  }else{const x=D.users[k];if(!x||hashPw(pw,x.salt)!==x.hash)return send(res,400,{error:'Wrong username or password.'});if(x.banned)return send(res,403,{error:'This account is banned.'})}
  const t=rnd(24);D.sessions[t]=k;save();return send(res,200,{token:t,me:pubUser(D.users[k])});
 }
 if(p=='/api/me'){if(!me)return need();if(req.method=='POST'){if(b.av)me.av=av(b.av);if(b.worn===null||me.owned.includes(b.worn))me.worn=b.worn;save()}return send(res,200,{me:pubUser(me)})}
 if(p=='/api/hats'){
  if(req.method=='GET'){const lk={};for(const id in D.likes)lk[id]=D.likes[id].length;return send(res,200,{hats:D.hats,sales:D.sales,likes:lk,liked:me?Object.keys(D.likes).filter(id=>D.likes[id].includes(me.name)):[]})}
  if(!me)return need();
  if(D.hats.filter(h=>h.creator==me.name).length>=50)return send(res,400,{error:'Hat limit reached (50).'});
  const parts=(Array.isArray(b.parts)?b.parts:[]).slice(0,16).map(q=>({t:['cylinder','cone','dome','sphere','box','torus','pyramid','prism','octa','ico'].includes(q.t)?q.t:'box',c:col(q.c),f:['matte','shiny','metal','glass','neon'].includes(q.f)?q.f:'matte',sx:clamp(q.sx,.05,3,.5),sy:clamp(q.sy,.05,3,.5),sz:clamp(q.sz,.05,3,.5),x:clamp(q.x,-1.6,1.6,0),y:clamp(q.y,-1.5,2.5,0),z:clamp(q.z,-1.6,1.6,0),r:clamp(q.r,-90,90,0),q:clamp(q.q,-90,90,0),ry:clamp(q.ry,-180,180,0),m:!!q.m}));
  if(!parts.length)return send(res,400,{error:'A hat needs at least one part.'});
  const id=/^h[0-9a-z]{6,20}$/.test(b.id)&&!D.hats.some(h=>h.id==b.id)?b.id:'h'+rnd(5);
  D.hats.push({id,name:String(b.name||'Untitled').slice(0,20),creator:me.name,price:clamp(b.price,0,1000,100)|0,parts,slot:['head','face','back'].includes(b.slot)?b.slot:'head',base:0,at:Date.now()});save();return send(res,200,{id});
 }
 if(p.startsWith('/api/thumb/')){const g=D.games.find(x=>x.id==p.slice(11)),m=g&&g.thumb&&/^data:(image\/\w+);base64,(.*)$/.exec(g.thumb);if(!m){res.writeHead(404);return res.end()}res.writeHead(200,{'content-type':m[1],'cache-control':'public, max-age=86400'});return res.end(Buffer.from(m[2],'base64'))}
 if(p=='/api/chat'){
  if(!me)return need();
  if(req.method=='GET')return send(res,200,{msgs:chat.slice(-60)});
  if(me.muted)return send(res,403,{error:'You are muted.'});
  const now=Date.now();if(now-(lc.get(me.name)||0)<700)return send(res,429,{error:'Slow down.'});lc.set(me.name,now);
  const text=String(b.text||'').trim().slice(0,200);if(!text)return send(res,400,{error:'Empty message.'});
  chat.push({id:++cid,name:me.name,text,t:now,admin:!!me.admin});if(chat.length>200)chat.shift();return send(res,200,{ok:1});
 }
 if(p=='/api/like'){
  if(!me)return need();
  const id=String(b.id);if(!(id in PRICE)&&!D.hats.some(h=>h.id==id))return send(res,404,{error:'No such item.'});
  const L=D.likes[id]=D.likes[id]||[],i=L.indexOf(me.name);if(i>=0)L.splice(i,1);else L.push(me.name);save();return send(res,200,{n:L.length,liked:i<0});
 }
 if(p=='/api/mine/delete'){
  if(!me)return need();
  const L=b.kind=='hat'?D.hats:D.games,i=L.findIndex(x=>x.id==b.id);if(i<0)return send(res,404,{error:'Not found.'});
  if(L[i].creator!==me.name&&!me.admin)return send(res,403,{error:'That is not yours.'});
  L.splice(i,1);if(b.kind=='hat'){delete D.sales[b.id];delete D.likes[b.id]}save();return send(res,200,{ok:1});
 }
 if(p=='/api/admin/chatdel'){
  if(!me)return need();if(!me.admin)return send(res,403,{error:'Admins only.'});
  const i=chat.findIndex(m=>m.id==b.id);if(i>=0)chat.splice(i,1);return send(res,200,{ok:1});
 }
 if(p=='/api/game'){const g=D.games.find(x=>x.id==new URL(req.url,'http://x').searchParams.get('id'));return g?send(res,200,{game:{...g,thumb:undefined}}):send(res,404,{error:'Not found.'})}
 if(p=='/api/games'){
  if(req.method=='GET')return send(res,200,{games:D.games.map(g=>({...g,objs:undefined,thumb:undefined,ht:!!g.thumb,n:g.objs?g.objs.length:0}))});
  if(!me)return need();
  const objs=Array.isArray(b.objs)?b.objs.slice(0,150).map(o=>{const k=['p','c','s','d'].includes(o&&o.k)?o.k:null;if(!k)return null;const r={k,x:clamp(o.x,-60,60,0),y:clamp(o.y,-5,60,0),z:clamp(o.z,-60,60,0)};
   if(k=='p'){r.t=['solid','lava','bounce','check','goal','crumble'].includes(o.t)?o.t:'solid';r.sx=clamp(o.sx,.5,80,3);r.sz=clamp(o.sz,.5,80,3);r.th=clamp(o.th,.25,20,.5);r.c=col(o.c);if(o.mv&&['x','y','z'].includes(o.mv.a))r.mv={a:o.mv.a,d:clamp(o.mv.d,0,30,4),s:clamp(o.mv.s,.1,6,1)}}
   if(k=='d'){r.shape=['box','sphere','cone','cylinder','pyramid','prism'].includes(o.shape)?o.shape:'box';r.sx=clamp(o.sx,.1,40,2);r.sy=clamp(o.sy,.1,40,2);r.sz=clamp(o.sz,.1,40,2);r.c=col(o.c)}
   return r}).filter(Boolean):null;
  if(objs&&!objs.some(o=>o.k=='p'))return send(res,400,{error:'Add at least one platform.'});
  let th=null;if(typeof b.thumb=='string'){if(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(b.thumb)||b.thumb.length>90000)return send(res,400,{error:'Thumbnail must be a small image.'});th=b.thumb}
  const ex=b.update?D.games.find(g=>g.id==b.id):null;
  if(ex&&ex.creator!==me.name&&!me.admin)return send(res,403,{error:'That is not your game.'});
  if(!ex&&D.games.filter(g=>g.creator==me.name).length>=30)return send(res,400,{error:'Game limit reached (30).'});
  const f={name:String(b.name||'Untitled').slice(0,24),desc:String(b.desc||'').slice(0,80),genre:['Obby','Adventure','Parkour','Chill','Puzzle'].includes(b.genre)?b.genre:'Obby',mode:['obby','coins','roam','custom'].includes(b.mode)?b.mode:'obby',sky:col(b.sky),ground:col(b.ground),size:clamp(b.size,5,40,16)|0,seed:clamp(b.seed,1,999999,1)|0,spd:clamp(b.spd,4,14,7),jmp:clamp(b.jmp,6,16,9),grav:clamp(b.grav,10,40,22),coinN:clamp(b.coinN,5,60,25)|0,cps:!!b.cps,light:clamp(b.light,.3,1.6,1),fog:b.fog!==false,killY:clamp(b.killY,-80,-5,-15),objs};
  if(ex){Object.assign(ex,f);if(th){ex.thumb=th;ex.tv=Date.now()}else if(b.dropThumb){delete ex.thumb;ex.tv=0}save();return send(res,200,{id:ex.id})}
  const id=/^c\d{10,14}$/.test(b.id)&&!D.games.some(g=>g.id==b.id)?b.id:'c'+Date.now()+rnd(1).replace(/\D/g,'');
  D.games.push({id,creator:me.name,...f,thumb:th||undefined,tv:th?Date.now():0,at:Date.now()});save();return send(res,200,{id});
 }
 if(p=='/api/buy'){
  if(!me)return need();
  const id=String(b.id),h=D.hats.find(x=>x.id==id),price=h?h.price:PRICE[id];
  if(price==null)return send(res,404,{error:'No such hat.'});
  if(me.owned.includes(id))return send(res,400,{error:'You already own this.'});
  if(me.coins<price)return send(res,400,{error:'Not enough Rukos.'});
  me.coins-=price;me.owned.push(id);D.sales[id]=(D.sales[id]||0)+1;
  if(h){const c=D.users[h.creator.toLowerCase()];if(c&&c!==me)c.coins+=price}
  save();return send(res,200,{me:pubUser(me)});
 }
 if(p=='/api/earn'){
  if(!me)return need();
  const now=Date.now(),n=clamp(b.n,0,150,0)|0;me.earn=(me.earn||[]).filter(e=>e[0]>now-600000);
  const g=Math.max(0,Math.min(n,400-me.earn.reduce((a,e)=>a+e[1],0)));
  if(g){me.earn.push([now,g]);me.coins+=g;save()}return send(res,200,{me:pubUser(me)});
 }
 if(p=='/api/admin/hat'||p=='/api/admin/game'){
  if(!me)return need();if(!me.admin)return send(res,403,{error:'Admins only.'});
  const hat=p.endsWith('hat'),L=hat?D.hats:D.games,i=L.findIndex(x=>x.id==b.id);if(i<0)return send(res,404,{error:'Not found.'});
  if(b.action=='delete'){L.splice(i,1);if(hat)delete D.sales[b.id]}
  else if(b.action=='edit'){const x=L[i];if(b.name)x.name=String(b.name).slice(0,hat?20:24);if(hat)x.price=clamp(b.price,0,1000,x.price)|0;else if(typeof b.desc=='string')x.desc=b.desc.slice(0,80)}
  save();return send(res,200,{ok:1});
 }
 if(p=='/api/admin/users'){
  if(!me)return need();if(!me.admin)return send(res,403,{error:'Admins only.'});
  return send(res,200,{users:Object.values(D.users).map(u=>({name:u.name,coins:u.coins,owned:u.owned.length,banned:!!u.banned,muted:!!u.muted,admin:!!u.admin}))});
 }
 if(p=='/api/admin/grant'){
  if(!me)return need();if(!me.admin)return send(res,403,{error:'Admins only.'});
  if(b.all){const n=clamp(b.coins,-1e6,1e6,0)|0;for(const u of Object.values(D.users))u.coins=Math.max(0,u.coins+n);save();return send(res,200,{ok:1})}
  const u=D.users[String(b.user||'').toLowerCase()];if(!u)return send(res,404,{error:'No such player.'});
  if(b.coins!=null)u.coins=Math.max(0,u.coins+(clamp(b.coins,-1e6,1e6,0)|0));
  if(b.hat){const id=String(b.hat);if(!(id in PRICE)&&!D.hats.some(h=>h.id==id))return send(res,404,{error:'No such item.'});const i=u.owned.indexOf(id);if(b.take){if(i>=0)u.owned.splice(i,1);if(u.worn==id)u.worn=null}else if(i<0)u.owned.push(id)}
  if(b.ban!=null&&!u.admin)u.banned=!!b.ban;
  if(b.mute!=null&&!u.admin)u.muted=!!b.mute;
  save();return send(res,200,{ok:1});
 }
 if(p=='/api/servers'){const players=[];for(const id in rooms)for(const c of rooms[id].cl.values())players.push({server:id.slice(3),name:c.name});return send(res,200,{players})}
 if(p.startsWith('/api/room/')){
  if(!me)return need();
  const id=decodeURIComponent(p.split('/')[3]||'');if(!/^srv\w{1,40}$/.test(id))return send(res,400,{error:'Bad room'});
  if(p.endsWith('/stream')){
   const r=room(id);if(r.cl.size>=10)return send(res,409,{error:'Server full'});
   const peer=rnd(6);res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'});
   res.write('retry: 3000\n\n');r.cl.set(peer,{res,name:me.name,presence:null});res.write('data: '+JSON.stringify({hello:peer})+'\n\n');r.dirty=1;
   req.on('close',()=>{r.cl.delete(peer);r.dirty=1;if(!r.cl.size&&rooms[id]===r)delete rooms[id]});return;
  }
  if(p.endsWith('/chat')){
   const r=rooms[id],c=r&&r.cl.get(String(b.peer));if(!c||c.name!==me.name)return send(res,404,{});
   if(me.muted)return send(res,403,{error:'You are muted.'});
   const now=Date.now();if(now-(lc.get(me.name)||0)<700)return send(res,429,{error:'Slow down.'});lc.set(me.name,now);
   const text=String(b.text||'').trim().slice(0,160);if(!text)return send(res,400,{error:'Empty message.'});
   const m='data: '+JSON.stringify({chat:{peer:b.peer,name:me.name,text}})+'\n\n';for(const x of r.cl.values())x.res.write(m);return send(res,200,{ok:1});
  }
  if(p.endsWith('/pos')){
   const r=rooms[id],c=r&&r.cl.get(String(b.peer));if(!c||c.name!==me.name)return send(res,404,{});
   const q=b.presence||{},ps={};for(const k of ['x','y','z','r'])ps[k]=clamp(q[k],-500,500,0);
   ps.hat=typeof q.hat=='string'?q.hat.slice(0,30):null;ps.av=av(q.av);c.presence=ps;r.dirty=1;return send(res,200,{ok:1});
  }
 }
 send(res,404,{error:'Not found'});
 }catch(e){console.error(e);send(res,500,{error:'Server error'})}
}).listen(PORT,()=>console.log('Ruko running on port '+PORT));
setInterval(()=>{for(const id in rooms){const r=rooms[id];if(!r.dirty)continue;r.dirty=0;const m='data: '+JSON.stringify({peers:[...r.cl].map(([peer,c])=>({peer,name:c.name,presence:c.presence||{}}))})+'\n\n';for(const c of r.cl.values())c.res.write(m)}},100);
setInterval(()=>{for(const r of Object.values(rooms))for(const c of r.cl.values())c.res.write(': ping\n\n')},15000);
