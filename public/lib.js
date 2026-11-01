import {createClient} from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./config.js";
export const sb=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
export const fmt=n=>"Rs. "+Number(n||0).toLocaleString("en-PK");
export const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const ph="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#16224a"/><circle cx="100" cy="75" r="35" fill="#2c3d78"/><rect x="45" y="120" width="110" height="80" rx="40" fill="#2c3d78"/></svg>');
export async function loadAll(tables){const o={};await Promise.all(tables.map(async t=>{const {data,error}=await sb.from(t).select("*");if(error)throw error;o[t]=data}));return o}
export function watch(tables,cb,st){const ch=sb.channel("rt"+Math.random());tables.forEach(t=>ch.on("postgres_changes",{event:"*",schema:"public",table:t},cb));
 ch.subscribe(s=>{const ok=s==="SUBSCRIBED";st&&st(ok);if(ok)cb()});return ch}

const PK={players:"id",teams:"id",history:"player_id",bids:"id",notifications:"player_id",team_contacts:"team_id",auction:"id"};
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
