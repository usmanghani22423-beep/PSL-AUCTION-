import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";
export const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
export const fmt=n=>"Rs. "+Number(n||0).toLocaleString("en-PK");
export const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const ph="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#062722"/><circle cx="100" cy="75" r="35" fill="#174C3D"/><rect x="45" y="120" width="110" height="80" rx="40" fill="#174C3D"/></svg>');
export async function loadAll(tables){const o={};await Promise.all(tables.map(async t=>{const {data,error}=await sb.from(t).select("*");if(error)throw error;o[t]=data}));return o}
export function watch(tables,cb,st){const ch=sb.channel("rt"+Math.random());tables.forEach(t=>ch.on("postgres_changes",{event:"*",schema:"public",table:t},cb));
 ch.subscribe(s=>{const ok=s==="SUBSCRIBED";st&&st(ok);if(ok)cb()});return ch}

const PK={players:"id",teams:"id",history:"player_id",bids:"id",notifications:"player_id",team_contacts:"team_id",auction:"id",bid_rules:"min_price",rules:"key",announcement:"id",final_xi:"team_id"};
// Row-level realtime store: applies INSERT/UPDATE/DELETE events directly (no refetch), full reload on every (re)connect.
export function sync(tables,apply,st){const store={};let tm;let due=Infinity;const sched=(ms=100)=>{const at=Date.now()+ms;if(at>=due)return;due=at;clearTimeout(tm);tm=setTimeout(()=>{due=Infinity;apply(store)},ms)};
 const full=async()=>{const o=await loadAll(tables);tables.forEach(t=>store[t]=o[t]);apply(store)};
 const ch=sb.channel("rt"+Math.random());
 tables.forEach(t=>ch.on("postgres_changes",{event:"*",schema:"public",table:t},p=>{const k=PK[t],rows=store[t]||(store[t]=[]);
  if(p.eventType==="DELETE"){const id=p.old[k];store[t]=rows.filter(r=>r[k]!==id)}
  else{const i=rows.findIndex(r=>r[k]===p.new[k]);i>=0?rows[i]=p.new:rows.push(p.new)}sched(t==="auction"||t==="bids"?0:100)}));
 ch.subscribe(x=>{const ok=x==="SUBSCRIBED";st&&st(ok);if(ok)full().catch(e=>console.error(e))});
 return {ch,set(t,rows){store[t]=rows;sched()}}}

export const foreign=p=>{const c=String(p.country||"").trim().toLowerCase();return !!c&&c!=="pakistan"};
export const cat=p=>{const r=String(p.role||"").toLowerCase();return /keeper|wk/.test(r)?"Wicketkeeper":/all/.test(r)?"All-rounder":/bowl/.test(r)?"Bowler":/bat/.test(r)?"Batter":"Other"};
export const CATS=["Batter","Wicketkeeper","All-rounder","Bowler","Other"];
export function squad(list){return CATS.map(c=>{const ps=list.filter(p=>cat(p)===c);return ps.length?`<div style="margin:8px 0"><small>${c} (${ps.length})</small>${ps.map(p=>`<div>${esc(p.name)}${foreign(p)?" ✈️":""} ${p.acq?`<span class=badge>${esc(p.acq)}</span>`:""} <small>${p.sold_price?fmt(p.sold_price):""}</small></div>`).join("")}</div>`:""}).join("")||"<small>No players yet</small>"}
export const stepFor=(rules,price)=>{let s=2500000;[...rules].sort((a,b)=>a.min_price-b.min_price).forEach(r=>{if(price>=r.min_price)s=r.step});return s};
export const rv=(rules,k,d)=>Number(rules.find(r=>r.key===k)?.val??d);
export function balance(list,rules){const need={Batter:rv(rules,"min_batter",4),Wicketkeeper:rv(rules,"min_wk",2),"All-rounder":rv(rules,"min_ar",2),Bowler:rv(rules,"min_bowler",4)},cnt=c=>list.filter(p=>cat(p)===c).length;
 const chips=Object.entries(need).map(([c,n])=>`<span class=badge style="background:${cnt(c)>=n?"var(--g)":"#8A6D1A"};margin:2px;display:inline-block">${c} ${cnt(c)}/${n}</span>`).join("");
 const fc=list.filter(foreign).length,fm=rv(rules,"foreign_max",7),lack=Object.entries(need).filter(([c,n])=>cnt(c)<n).map(([c,n])=>`${n-cnt(c)} more ${c}`);
 return chips+`<span class=badge style="background:${fc>=fm?"var(--r)":"#174C3D"};margin:2px;display:inline-block">✈️ ${fc}/${fm}</span>`+(lack.length?`<div><small>⚠ Still needs: ${lack.join(", ")}</small></div>`:"")}
// Install as an app (Add to Home screen) + service worker
try{const m={name:"PSL 2027 Mock Auction",short_name:"PSL Auction",start_url:location.href,scope:location.origin+"/",display:"standalone",background_color:"#031B18",theme_color:"#062722",icons:[{src:location.origin+"/icon-192.png",sizes:"192x192",type:"image/png"},{src:location.origin+"/icon-512.png",sizes:"512x512",type:"image/png"}]};
 const l=document.createElement("link");l.rel="manifest";l.href=URL.createObjectURL(new Blob([JSON.stringify(m)],{type:"application/manifest+json"}));document.head.appendChild(l);
 const a=document.createElement("link");a.rel="apple-touch-icon";a.href="/icon-192.png";document.head.appendChild(a);
 const t=document.createElement("meta");t.name="theme-color";t.content="#062722";document.head.appendChild(t);
 if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")}catch(e){}

// ================= Redesign helpers: themes, logos, nav, cards =================
export const THEMES={
 "karachi-kings":{p:"#0877C9",s:"#003B70",a:"#D5B15B",t:"#FFFFFF"},
 "lahore-qalandars":{p:"#087A48",s:"#D62828",a:"#FFFFFF",t:"#FFFFFF"},
 "islamabad-united":{p:"#E32636",s:"#202020",a:"#D8D8D8",t:"#FFFFFF"},
 "peshawar-zalmi":{p:"#F5C518",s:"#191919",a:"#FFFFFF",t:"#FFFFFF"},
 "quetta-gladiators":{p:"#673AB7",s:"#31145E",a:"#D4AF37",t:"#FFFFFF"},
 "multan-sultans":{p:"#087F83",s:"#064B50",a:"#D4AF37",t:"#FFFFFF"},
 "hyderabad-kingsmen":{p:"#C65A32",s:"#702B24",a:"#F2C879",t:"#FFFFFF"},
 "rawalpindi-pindiz":{p:"#E87524",s:"#292929",a:"#F5C518",t:"#FFFFFF"}};
export const slugOf=t=>{const n=String(t?.name||"").toLowerCase();return n.includes("karachi")?"karachi-kings":n.includes("lahore")?"lahore-qalandars":n.includes("islamabad")?"islamabad-united":n.includes("peshawar")?"peshawar-zalmi":n.includes("quetta")?"quetta-gladiators":n.includes("multan")?"multan-sultans":n.includes("hyderabad")?"hyderabad-kingsmen":n.includes("rawalpindi")?"rawalpindi-pindiz":""};
const shade=(h,k)=>{const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h||"");if(!m)return"#062722";const f=i=>Math.max(0,Math.min(255,Math.round(parseInt(m[i],16)*(1+k)))).toString(16).padStart(2,"0");return"#"+f(1)+f(2)+f(3)};
// built-in palette unless the admin picked a different colour for the team (then it is derived from that colour)
export const themeOf=t=>{const c=THEMES[slugOf(t)],col=(t?.color||"").trim();if(c&&(!col||col.toLowerCase()===c.p.toLowerCase()))return{...c};const p=col||c?.p||"#00A86B";return{p,s:shade(p,-.55),a:c?.a||"#F5C518",t:"#FFFFFF"}};
export const onColor=h=>{const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h||"");if(!m)return"#fff";const [r,g,b]=[1,2,3].map(i=>parseInt(m[i],16));return(0.299*r+0.587*g+0.114*b)>150?"#031B18":"#fff"};
export const themeStyle=t=>{const k=themeOf(t);return `--tp:${k.p};--ts:${k.s};--ta:${k.a};--tt:${k.t};--tpt:${onColor(k.p)}`};
export const initials=n=>String(n||"?").split(/\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,2).toUpperCase();
export const teamLogo=(t,px=40)=>{if(!t)return"";const sl=slugOf(t),k=themeOf(t),f=t.logo?` data-f="${esc(t.logo)}"`:"";
 const img=sl?`<img src="/assets/teams/${sl}.png" alt="${esc(t.name)} logo"${f} onload="this.parentNode.classList.add('ok')" onerror="if(this.dataset.f){this.src=this.dataset.f;this.dataset.f=''}else this.remove()">`:t.logo?`<img src="${esc(t.logo)}" alt="" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">`:"";
 return `<span class=tl style="width:${px}px;height:${px}px;font-size:${Math.round(px*.38)}px;background:${k.p};color:${onColor(k.p)}">${esc(initials(t.name))}${img}</span>`};
export const pslLogo=(h=36)=>`<img class=psl-logo-img src="/assets/psl-logo.png" alt="Pakistan Super League logo" style="height:${h}px" onerror="this.style.display='none'">`;
export function mountNav(active){addBeams();const el=document.getElementById("nav-root");if(!el)return;
 const L=[["index.html","Home"],["audience.html","Live Auction"],["teams.html","Teams"],["players.html","Players"],["results.html","Auction Results"],["stats.html","Statistics"],["about.html","About PSL"]];
 let back="";try{if(/bid\.html$/.test(location.pathname)&&location.search.includes("code="))localStorage.setItem("bidLink",location.pathname+location.search);else back=localStorage.getItem("bidLink")||""}catch(e){}
 el.innerHTML=`<header class=nav><a href="index.html" class=brand>${pslLogo(36)}<span>PSL 2027<small>Mock Auction</small></span></a>${back?`<a class="btn g" href="${esc(back)}" style="margin-left:6px">↩ Live bid</a>`:""}<button class=burger aria-label=Menu onclick="document.querySelector('.nav ul').classList.toggle('open')">☰</button><ul>${L.map(([h,n])=>`<li><a href="${h}" class="${h===active?"on":""}">${n}</a></li>`).join("")}</ul><span class=conn><i id=c class=dot></i><small id=cs></small></span></header>`}
export function mountFooter(){const el=document.getElementById("foot-root");if(el)el.innerHTML=`<div class=foot>${pslLogo(40)}<p>Unofficial fan-made mock auction for entertainment. Pakistan Super League names and logos belong to their respective owners. Sample players are demo data.</p></div>`}
export const soldCard=(p,t,o={})=>`<div class=sc style="${themeStyle(t)}"><div class=sc-h>PLAYER SOLD</div><div class=sc-b><img class=sc-p src="${esc(p.image||ph)}" onerror="this.src='${ph}'" alt="${esc(p.name)}"><div class=sc-i><h2>${esc(p.name)}</h2><div>${esc(p.role||"")} · ${esc(p.country||"")}${foreign(p)?" ✈️":""}</div><div class=sc-t>${teamLogo(t,46)}<b>${esc(t?.name||"")}</b></div><div class=sc-w>Winning bid</div><div class=sc-pr>${fmt(p.sold_price)}</div><small>${o.bids?o.bids+" bids · ":""}Base ${fmt(p.base_price)}${p.acq?" · "+esc(p.acq):""}</small></div></div><div class=sc-s>SOLD</div></div>`;
export const playerCard=(p,t)=>{const sold=p.status==="Sold",un=p.status==="Unsold";return `<div class="pc ${sold?"sold":un?"unsold":""}" ${sold?`style="${themeStyle(t)}"`:""}><img class=pi src="${esc(p.image||ph)}" loading=lazy onerror="this.src='${ph}'" alt="${esc(p.name)}"><div class=pc-i><h3>${esc(p.name)}${foreign(p)?" ✈️":""}</h3><div>${esc(p.country||"")} · ${esc(p.role||"")}</div><small>${esc(p.bat||"")}${p.bowl?" · "+esc(p.bowl):""}</small><div class=pc-f><span>Base ${fmt(p.base_price)}</span><span class="badge ${esc(p.status)}">${un?"UNSOLD":sold?"SOLD":esc(p.status)}</span></div>${sold?`<div class=pc-t>${teamLogo(t,22)} ${esc(t?.name||"")} · <b>${fmt(p.sold_price)}</b></div>`:""}</div></div>`};
export const teamCard=t=>`<a class=tc style="${themeStyle(t)}" href="team.html?team=${esc(t.id)}">${teamLogo(t,56)}<div><b>${esc(t.name)}</b><small>Owner: ${esc(t.owner||"—")}</small><small>${t.squad_count}/${t.max_squad} players · left ${fmt(t.purse-t.spent)}</small></div></a>`;
export function teamDash(t,players,rules,xi){const mine=players.filter(p=>p.team_id===t.id&&p.status==="Sold").sort((a,b)=>b.sold_price-a.sold_price),c=x=>mine.filter(p=>cat(p)===x).length;
 return `<div class=td style="${themeStyle(t)}"><div class=td-h>${teamLogo(t,84)}<div><h1>${esc(t.name)}</h1><div>Team owner: <b>${esc(t.owner||"—")}</b></div></div></div>
 <div class=stats>${[["Total budget",fmt(t.purse)],["Spent",fmt(t.spent)],["Remaining purse",fmt(t.purse-t.spent)],["Players",t.squad_count+" / "+t.max_squad],["Batsmen",c("Batter")],["Bowlers",c("Bowler")],["All-rounders",c("All-rounder")],["Wicketkeepers",c("Wicketkeeper")]].map(([a,b])=>`<div class=st><small>${a}</small><b>${b}</b></div>`).join("")}</div>
 <div style="margin:8px 0">${balance(mine,rules||[])}</div>
 <div class=tw><table><tr><th>Player</th><th>Role</th><th>Country</th><th>Price</th><th>Status</th></tr>${mine.map(p=>`<tr><td>${esc(p.name)}${foreign(p)?" ✈️":""}</td><td>${esc(p.role)}</td><td>${esc(p.country)}</td><td>${fmt(p.sold_price)}</td><td><span class="badge Sold">${esc(p.acq||"SOLD")}</span></td></tr>`).join("")||"<tr><td colspan=5>No players yet</td></tr>"}</table></div>
 ${xiSection(xi,players)}<h3 style="margin-top:16px">Sold player cards</h3><div class=sgrid>${mine.map(p=>soldCard(p,t)).join("")||"<small>No players purchased yet</small>"}</div></div>`}
export const bowlType=p=>{const b=String(p.bowl||"").toLowerCase();if(!b||/not applicable|^n\/?a$|none/.test(b))return"";if(/spin|orthodox|wrist|break|chinaman|googly/.test(b))return"Spin";if(/fast|medium|pace|seam/.test(b))return"Fast";return""};
export const bpLabel=v=>+(Number(v)/1e7).toFixed(2)+" Cr";
export const lc=v=>v>=1e7?+(v/1e7).toFixed(2)+" Cr":+(v/1e5).toFixed(2)+" Lakh";
export const rulesText=rules=>{const r=[...rules].sort((a,b)=>a.min_price-b.min_price);return r.map((x,i)=>{const n=r[i+1];return(i===0&&n?"Under "+lc(n.min_price):n?lc(x.min_price)+" – "+lc(n.min_price):lc(x.min_price)+" and above")+": +"+lc(x.step)}).join(" · ")};
// ---- attraction helpers: confetti, count-up, synthesised gavel/fanfare, splash intro
export function confetti(colors=["#F5C518","#00A86B","#FFFFFF"],n=150){const c=document.createElement("canvas");c.style.cssText="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:120";c.width=innerWidth;c.height=innerHeight;document.body.appendChild(c);
 const x=c.getContext("2d"),P=Array.from({length:n},()=>({x:c.width/2+(Math.random()-.5)*240,y:c.height*.55,vx:(Math.random()-.5)*18,vy:-Math.random()*19-6,s:5+Math.random()*8,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:colors[Math.random()*colors.length|0],g:.42+Math.random()*.2}));let f=0;
 (function tick(){x.clearRect(0,0,c.width,c.height);P.forEach(p=>{p.vy+=p.g;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);x.restore()});if(++f<190)requestAnimationFrame(tick);else c.remove()})()}
export const countUp=(el,from,to,ms,f)=>{const t0=performance.now();(function s(t){const k=Math.min(1,(t-t0)/ms);el.textContent=f(Math.round(from+(to-from)*k));if(k<1)requestAnimationFrame(s)})(t0)};
export const tone=(ac,f,d=.15,type="sine",g=.15,at=0)=>{if(!ac)return;const o=ac.createOscillator(),v=ac.createGain(),t=ac.currentTime+at;o.type=type;o.frequency.setValueAtTime(f,t);v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(v);v.connect(ac.destination);o.start(t);o.stop(t+d)};
export const gavel=ac=>{if(!ac)return;tone(ac,160,.22,"triangle",.4);tone(ac,70,.3,"sine",.5);tone(ac,160,.22,"triangle",.4,.18);tone(ac,523,.25,"triangle",.15,.45);tone(ac,659,.25,"triangle",.15,.62);tone(ac,784,.5,"triangle",.18,.8)};
export function splash(){try{if(sessionStorage.getItem("sp"))return;sessionStorage.setItem("sp","1")}catch(e){}const d=document.createElement("div");d.id="splash";d.innerHTML=`${pslLogo(150)}<h1>PLAYER AUCTION 2027</h1><p>Pakistan Super League · Mock Auction</p>`;document.body.appendChild(d);setTimeout(()=>d.remove(),2500)}
// ---- Playing XI helpers
export const xiOrder=ps=>[...ps].sort((a,b)=>CATS.indexOf(cat(a))-CATS.indexOf(cat(b))||String(a.name).localeCompare(b.name));
const xiSection=(xi,players)=>{const l=xi&&xi.player_ids?xiOrder(xi.player_ids.map(id=>players.find(p=>p.id===id)).filter(Boolean)):[];return l.length?`<h3 style="margin-top:16px">Playing XI <button class=s id=xiDl style="margin-left:8px">Download XI card</button></h3><div class=tw><table><tr><th>#</th><th>Player</th><th>Role</th></tr>${l.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.name)}${p.id===xi.captain?" (C)":""}${foreign(p)?" ✈️":""}</td><td>${esc(p.role)}</td></tr>`).join("")}</table></div>`:""};
export async function xiBlob(t,players,xi){const k=themeOf(t),list=xiOrder((xi.player_ids||[]).map(id=>players.find(p=>p.id===id)).filter(Boolean)),c=document.createElement("canvas");c.width=1080;c.height=1440;const x=c.getContext("2d");
 const g=x.createLinearGradient(0,0,0,1440);g.addColorStop(0,k.s);g.addColorStop(1,"#031B18");x.fillStyle=g;x.fillRect(0,0,1080,1440);x.fillStyle=k.p;x.fillRect(0,0,1080,14);x.fillRect(0,1426,1080,14);
 const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src});
 const [lg,tl]=await Promise.all([load("/assets/psl-logo.png"),load("/assets/teams/"+slugOf(t)+".png").then(i=>i||(t.logo?load(t.logo):null))]);
 if(lg){const h=90,w=h*lg.width/lg.height;x.drawImage(lg,40,40,w,h)}
 if(tl){x.save();x.beginPath();x.arc(980,90,55,0,7);x.clip();x.drawImage(tl,925,35,110,110);x.restore()}
 x.textAlign="center";x.fillStyle="#F5C518";x.font="bold 40px Arial";x.fillText("PSL 2027 MOCK AUCTION",540,190);
 let fs=76;x.font="900 "+fs+"px Arial";while(x.measureText(t.name.toUpperCase()).width>940&&fs>34){fs-=4;x.font="900 "+fs+"px Arial"}x.fillStyle="#fff";x.fillText(t.name.toUpperCase(),540,280);
 x.fillStyle=k.a;x.font="bold 52px Arial";x.fillText("PLAYING XI",540,350);
 list.forEach((p,i)=>{const y=410+i*86;x.fillStyle="rgba(255,255,255,.08)";x.fillRect(70,y,940,72);x.fillStyle=k.p;x.fillRect(70,y,10,72);x.textAlign="left";x.fillStyle="#fff";x.font="bold 36px Arial";x.fillText((i+1)+".  "+p.name+(p.id===xi.captain?"  (C)":""),100,y+47);x.textAlign="right";x.fillStyle="#A8B8B1";x.font="28px Arial";x.fillText(cat(p)+(foreign(p)?"  · OVERSEAS":""),990,y+47)});
 x.textAlign="center";x.fillStyle="#A8B8B1";x.font="26px Arial";x.fillText("Mock auction for entertainment",540,1395);
 return new Promise(r=>c.toBlob(r,"image/png"))}
export async function shareBlob(blob,name,text){const f=new File([blob],name,{type:"image/png"});if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],text});return}catch(e){}}const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click()}
export function addBeams(){if(document.querySelector(".beams"))return;document.body.insertAdjacentHTML("afterbegin","<div class=beams><i></i><i></i></div>")}
