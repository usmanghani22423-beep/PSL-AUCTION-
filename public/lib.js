import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";
export const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
export const fmt=n=>"Rs. "+Number(n||0).toLocaleString("en-PK");
export const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const ph="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#17232D"/><circle cx="100" cy="75" r="35" fill="#30424E"/><rect x="45" y="120" width="110" height="80" rx="40" fill="#30424E"/></svg>');
export async function loadAll(tables){const o={};await Promise.all(tables.map(async t=>{const {data,error}=await sb.from(t).select("*");if(error)throw error;o[t]=data}));return o}
export function watch(tables,cb,st){const ch=sb.channel("rt"+Math.random());tables.forEach(t=>ch.on("postgres_changes",{event:"*",schema:"public",table:t},cb));
 ch.subscribe(s=>{const ok=s==="SUBSCRIBED";st&&st(ok);if(ok)cb()});return ch}

const PK={players:"id",teams:"id",history:"player_id",bids:"id",notifications:"player_id",team_contacts:"team_id",auction:"id",bid_rules:"min_price",rules:"key",announcement:"id"};
// Row-level realtime store: applies INSERT/UPDATE/DELETE events directly (no refetch), full reload on every (re)connect.
export function sync(tables,apply,st){const store={};let tm;const sched=()=>{clearTimeout(tm);tm=setTimeout(()=>apply(store),100)};
 const full=async()=>{const o=await loadAll(tables);tables.forEach(t=>store[t]=o[t]);apply(store)};
 const ch=sb.channel("rt"+Math.random());
 tables.forEach(t=>ch.on("postgres_changes",{event:"*",schema:"public",table:t},p=>{const k=PK[t],rows=store[t]||(store[t]=[]);
  if(p.eventType==="DELETE"){const id=p.old[k];store[t]=rows.filter(r=>r[k]!==id)}
  else{const i=rows.findIndex(r=>r[k]===p.new[k]);i>=0?rows[i]=p.new:rows.push(p.new)}sched()}));
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
 return chips+`<span class=badge style="background:${fc>=fm?"var(--r)":"#30424E"};margin:2px;display:inline-block">✈️ ${fc}/${fm}</span>`+(lack.length?`<div><small>⚠ Still needs: ${lack.join(", ")}</small></div>`:"")}
// Install as an app (Add to Home screen) + service worker
try{const m={name:"PSL 2027 Mock Auction",short_name:"PSL Auction",start_url:location.href,scope:location.origin+"/",display:"standalone",background_color:"#101820",theme_color:"#17232D",icons:[{src:location.origin+"/icon-192.png",sizes:"192x192",type:"image/png"},{src:location.origin+"/icon-512.png",sizes:"512x512",type:"image/png"}]};
 const l=document.createElement("link");l.rel="manifest";l.href=URL.createObjectURL(new Blob([JSON.stringify(m)],{type:"application/manifest+json"}));document.head.appendChild(l);
 const a=document.createElement("link");a.rel="apple-touch-icon";a.href="/icon-192.png";document.head.appendChild(a);
 const t=document.createElement("meta");t.name="theme-color";t.content="#17232D";document.head.appendChild(t);
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
export const themeOf=t=>{const c=THEMES[slugOf(t)];return c?{...c}:{p:t?.color||"#16A36A",s:"#17232D",a:"#D4AF37",t:"#FFFFFF"}};
export const onColor=h=>{const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h||"");if(!m)return"#fff";const [r,g,b]=[1,2,3].map(i=>parseInt(m[i],16));return(0.299*r+0.587*g+0.114*b)>150?"#101820":"#fff"};
export const themeStyle=t=>{const k=themeOf(t);return `--tp:${k.p};--ts:${k.s};--ta:${k.a};--tt:${k.t};--tpt:${onColor(k.p)}`};
export const initials=n=>String(n||"?").split(/\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,2).toUpperCase();
export const teamLogo=(t,px=40)=>{if(!t)return"";const sl=slugOf(t),k=themeOf(t),f=t.logo?` data-f="${esc(t.logo)}"`:"";
 const img=sl?`<img src="/assets/teams/${sl}.png" alt="${esc(t.name)} logo"${f} onload="this.parentNode.classList.add('ok')" onerror="if(this.dataset.f){this.src=this.dataset.f;this.dataset.f=''}else this.remove()">`:t.logo?`<img src="${esc(t.logo)}" alt="" onload="this.parentNode.classList.add('ok')" onerror="this.remove()">`:"";
 return `<span class=tl style="width:${px}px;height:${px}px;font-size:${Math.round(px*.38)}px;background:${k.p};color:${onColor(k.p)}">${esc(initials(t.name))}${img}</span>`};
export const pslLogo=(h=36)=>`<img class=psl-logo-img src="/assets/psl-logo.png" alt="Pakistan Super League logo" style="height:${h}px" onerror="this.style.display='none'">`;
export function mountNav(active){const el=document.getElementById("nav-root");if(!el)return;
 const L=[["index.html","Home"],["live.html","Live Auction"],["teams.html","Teams"],["players.html","Players"],["results.html","Auction Results"],["stats.html","Statistics"],["about.html","About PSL"]];
 el.innerHTML=`<header class=nav><a href="index.html" class=brand>${pslLogo(36)}<span>PSL 2027<small>Mock Auction</small></span></a><button class=burger aria-label=Menu onclick="document.querySelector('.nav ul').classList.toggle('open')">☰</button><ul>${L.map(([h,n])=>`<li><a href="${h}" class="${h===active?"on":""}">${n}</a></li>`).join("")}</ul><span class=conn><i id=c class=dot></i><small id=cs></small></span></header>`}
export function mountFooter(){const el=document.getElementById("foot-root");if(el)el.innerHTML=`<div class=foot>${pslLogo(40)}<p>Unofficial fan-made mock auction for entertainment. Pakistan Super League names and logos belong to their respective owners. Sample players are demo data.</p></div>`}
export const soldCard=(p,t,o={})=>`<div class=sc style="${themeStyle(t)}"><div class=sc-h>PLAYER SOLD</div><div class=sc-b><img class=sc-p src="${esc(p.image||ph)}" onerror="this.src='${ph}'" alt="${esc(p.name)}"><div class=sc-i><h2>${esc(p.name)}</h2><div>${esc(p.role||"")} · ${esc(p.country||"")}${foreign(p)?" ✈️":""}</div><div class=sc-t>${teamLogo(t,46)}<b>${esc(t?.name||"")}</b></div><div class=sc-w>Winning bid</div><div class=sc-pr>${fmt(p.sold_price)}</div><small>${o.bids?o.bids+" bids · ":""}Base ${fmt(p.base_price)}${p.acq?" · "+esc(p.acq):""}</small></div></div><div class=sc-s>SOLD</div></div>`;
export const playerCard=(p,t)=>{const sold=p.status==="Sold",un=p.status==="Unsold";return `<div class="pc ${sold?"sold":un?"unsold":""}" ${sold?`style="${themeStyle(t)}"`:""}><img class=pi src="${esc(p.image||ph)}" loading=lazy onerror="this.src='${ph}'" alt="${esc(p.name)}"><div class=pc-i><h3>${esc(p.name)}${foreign(p)?" ✈️":""}</h3><div>${esc(p.country||"")} · ${esc(p.role||"")}</div><small>${esc(p.bat||"")}${p.bowl?" · "+esc(p.bowl):""}</small><div class=pc-f><span>Base ${fmt(p.base_price)}</span><span class="badge ${esc(p.status)}">${un?"UNSOLD":sold?"SOLD":esc(p.status)}</span></div>${sold?`<div class=pc-t>${teamLogo(t,22)} ${esc(t?.name||"")} · <b>${fmt(p.sold_price)}</b></div>`:""}</div></div>`};
export const teamCard=t=>`<a class=tc style="${themeStyle(t)}" href="team.html?team=${esc(t.id)}">${teamLogo(t,56)}<div><b>${esc(t.name)}</b><small>Owner: ${esc(t.owner||"—")}</small><small>${t.squad_count}/${t.max_squad} players · left ${fmt(t.purse-t.spent)}</small></div></a>`;
export function teamDash(t,players,rules){const mine=players.filter(p=>p.team_id===t.id&&p.status==="Sold").sort((a,b)=>b.sold_price-a.sold_price),c=x=>mine.filter(p=>cat(p)===x).length;
 return `<div class=td style="${themeStyle(t)}"><div class=td-h>${teamLogo(t,84)}<div><h1>${esc(t.name)}</h1><div>Team owner: <b>${esc(t.owner||"—")}</b></div></div></div>
 <div class=stats>${[["Total budget",fmt(t.purse)],["Spent",fmt(t.spent)],["Remaining purse",fmt(t.purse-t.spent)],["Players",t.squad_count+" / "+t.max_squad],["Batsmen",c("Batter")],["Bowlers",c("Bowler")],["All-rounders",c("All-rounder")],["Wicketkeepers",c("Wicketkeeper")]].map(([a,b])=>`<div class=st><small>${a}</small><b>${b}</b></div>`).join("")}</div>
 <div style="margin:8px 0">${balance(mine,rules||[])}</div>
 <div class=tw><table><tr><th>Player</th><th>Role</th><th>Country</th><th>Price</th><th>Status</th></tr>${mine.map(p=>`<tr><td>${esc(p.name)}${foreign(p)?" ✈️":""}</td><td>${esc(p.role)}</td><td>${esc(p.country)}</td><td>${fmt(p.sold_price)}</td><td><span class="badge Sold">${esc(p.acq||"SOLD")}</span></td></tr>`).join("")||"<tr><td colspan=5>No players yet</td></tr>"}</table></div>
 <h3 style="margin-top:16px">Sold player cards</h3><div class=sgrid>${mine.map(p=>soldCard(p,t)).join("")||"<small>No players purchased yet</small>"}</div></div>`}
