import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";
export const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
export const fmt=n=>"Rs. "+Number(n||0).toLocaleString("en-PK");
export const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const ph="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#16224a"/><circle cx="100" cy="75" r="35" fill="#2c3d78"/><rect x="45" y="120" width="110" height="80" rx="40" fill="#2c3d78"/></svg>');
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
 const chips=Object.entries(need).map(([c,n])=>`<span class=badge style="background:${cnt(c)>=n?"var(--g)":"#8a6d00"};margin:2px;display:inline-block">${c} ${cnt(c)}/${n}</span>`).join("");
 const fc=list.filter(foreign).length,fm=rv(rules,"foreign_max",7),lack=Object.entries(need).filter(([c,n])=>cnt(c)<n).map(([c,n])=>`${n-cnt(c)} more ${c}`);
 return chips+`<span class=badge style="background:${fc>=fm?"var(--r)":"#2c3d78"};margin:2px;display:inline-block">✈️ ${fc}/${fm}</span>`+(lack.length?`<div><small>⚠ Still needs: ${lack.join(", ")}</small></div>`:"")}
// Install as an app (Add to Home screen) + service worker
try{const m={name:"PSL 2027 Mock Auction",short_name:"PSL Auction",start_url:location.href,scope:location.origin+"/",display:"standalone",background_color:"#070d1f",theme_color:"#0f1936",icons:[{src:location.origin+"/icon-192.png",sizes:"192x192",type:"image/png"},{src:location.origin+"/icon-512.png",sizes:"512x512",type:"image/png"}]};
 const l=document.createElement("link");l.rel="manifest";l.href=URL.createObjectURL(new Blob([JSON.stringify(m)],{type:"application/manifest+json"}));document.head.appendChild(l);
 const a=document.createElement("link");a.rel="apple-touch-icon";a.href="/icon-192.png";document.head.appendChild(a);
 const t=document.createElement("meta");t.name="theme-color";t.content="#0f1936";document.head.appendChild(t);
 if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")}catch(e){}
