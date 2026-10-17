// Ruko server: accounts, shared hats/games, sales, live game servers. No dependencies.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,'data'),FILE=path.join(DIR,'data.json');
fs.mkdirSync(DIR,{recursive:true});
let D={users:{},sessions:{},hats:[],games:[],sales:{}};
try{D=Object.assign(D,JSON.parse(fs.readFileSync(FILE,'utf8')))}catch(e){}
let dirty=0;const save=()=>{dirty=1};
const flush=()=>{if(!dirty)return;dirty=0;fs.writeFile(FILE+'.tmp',JSON.stringify(D),e=>{if(!e)fs.rename(FILE+'.tmp',FILE,()=>{})})};
setInterval(flush,2000);
process.on('SIGTERM',()=>{try{fs.writeFileSync(FILE,JSON.stringify(D))}catch(e){}process.exit(0)});
const INDEX=fs.readFileSync(path.join(__dirname,'public','index.html'));
const PRICE={r1:50,r2:120,r3:200,r4:400,r5:30,r6:80};
const rnd=n=>crypto.randomBytes(n).toString('hex');
const pubUser=u=>({name:u.name,coins:u.coins,owned:u.owned,worn:u.worn,av:u.av});
const hashPw=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const clamp=(v,a,b,d)=>Math.max(a,Math.min(b,Number.isFinite(+v)?+v:d));
const col=c=>/^#[0-9a-fA-F]{6}$/.test(c)?c:'#888888';
const av=a=>a&&typeof a=='object'?{skin:col(a.skin),shirt:col(a.shirt),pants:col(a.pants),face:clamp(a.face,0,3,0)|0}:null;
const send=(res,c,o)=>{res.writeHead(c,{'content-type':'application/json'});res.end(JSON.stringify(o))};
const body=req=>new Promise((ok,no)=>{let s='';req.on('data',d=>{s+=d;if(s.length>200000){no();req.destroy()}});req.on('end',()=>ok(s))});
const who=req=>{const t=(req.headers.authorization||'').slice(7)||new URL(req.url,'http://x').searchParams.get('token'),k=D.sessions[t];return k&&D.users[k]?D.users[k]:null};
const tries={},rooms={};
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
  }else{const x=D.users[k];if(!x||hashPw(pw,x.salt)!==x.hash)return send(res,400,{error:'Wrong username or password.'})}
  const t=rnd(24);D.sessions[t]=k;save();return send(res,200,{token:t,me:pubUser(D.users[k])});
 }
 if(p=='/api/me'){if(!me)return need();if(req.method=='POST'){if(b.av)me.av=av(b.av);if(b.worn===null||me.owned.includes(b.worn))me.worn=b.worn;save()}return send(res,200,{me:pubUser(me)})}
 if(p=='/api/hats'){
  if(req.method=='GET')return send(res,200,{hats:D.hats,sales:D.sales});
  if(!me)return need();
  if(D.hats.filter(h=>h.creator==me.name).length>=50)return send(res,400,{error:'Hat limit reached (50).'});
  const parts=(Array.isArray(b.parts)?b.parts:[]).slice(0,12).map(q=>({t:['cylinder','cone','dome','sphere','box','torus'].includes(q.t)?q.t:'box',c:col(q.c),f:['matte','shiny','neon'].includes(q.f)?q.f:'matte',sx:clamp(q.sx,.05,3,.5),sy:clamp(q.sy,.05,3,.5),sz:clamp(q.sz,.05,3,.5),x:clamp(q.x,-1.2,1.2,0),y:clamp(q.y,-.5,2.2,0),z:clamp(q.z,-1.2,1.2,0),r:clamp(q.r,-90,90,0),q:clamp(q.q,-90,90,0)}));
  if(!parts.length)return send(res,400,{error:'A hat needs at least one part.'});
  const id=/^h[0-9a-z]{6,20}$/.test(b.id)&&!D.hats.some(h=>h.id==b.id)?b.id:'h'+rnd(5);
  D.hats.push({id,name:String(b.name||'Untitled').slice(0,20),creator:me.name,price:clamp(b.price,0,1000,100)|0,parts,base:0});save();return send(res,200,{id});
 }
 if(p=='/api/games'){
  if(req.method=='GET')return send(res,200,{games:D.games});
  if(!me)return need();
  if(D.games.filter(g=>g.creator==me.name).length>=30)return send(res,400,{error:'Game limit reached (30).'});
  const id=/^c\d{10,14}$/.test(b.id)&&!D.games.some(g=>g.id==b.id)?b.id:'c'+Date.now()+rnd(1).replace(/\D/g,'');
  D.games.push({id,name:String(b.name||'Untitled').slice(0,24),desc:String(b.desc||'').slice(0,80),creator:me.name,mode:['obby','coins','roam'].includes(b.mode)?b.mode:'obby',sky:col(b.sky),ground:col(b.ground),size:clamp(b.size,5,40,16)|0,seed:clamp(b.seed,1,999999,1)|0,spd:clamp(b.spd,4,14,7),jmp:clamp(b.jmp,6,16,9),grav:clamp(b.grav,10,40,22),coinN:clamp(b.coinN,5,60,25)|0,cps:!!b.cps});save();return send(res,200,{id});
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
