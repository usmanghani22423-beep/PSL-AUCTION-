// Sound manager: local WAV files, one sound at a time (higher priority wins), master volume, per-sound switches, autoplay unlock
const FILES={bid:"bid",warn:"warn",sold:"sold",unsold:"unsold",applause:"applause",celebrate:"celebrate",reveal:"reveal",war:"war"};
const PRI={sold:5,unsold:5,celebrate:4,reveal:4,war:3,applause:2,warn:2,bid:1};
export const SOUNDS=[["bid","New bid"],["warn","Countdown warning"],["sold","SOLD hammer"],["unsold","UNSOLD"],["applause","Applause"],["celebrate","Celebration"],["reveal","Player reveal"],["war","Bid war"]];
let cfg={enabled:true,master:.8,on:{}},unlocked=false,cur=null,curPri=0;const cache={};
const get=k=>cache[k]||(cache[k]=new Audio("/assets/sounds/"+FILES[k]+".wav"));
export const setSoundConfig=c=>{cfg=c};
export const isUnlocked=()=>unlocked;
export function unlock(){if(unlocked)return;unlocked=true;Object.keys(FILES).forEach(k=>{const a=get(k);a.preload="auto";a.load()})}
export function play(k,force){if(!FILES[k])return;if(!force&&(!cfg.enabled||cfg.on[k]===false||!unlocked))return;
 const a=get(k);if(cur&&!cur.paused&&!cur.ended){if(PRI[k]<curPri)return;cur.pause()}
 try{a.currentTime=0}catch(e){}a.volume=Math.max(0,Math.min(1,Number(cfg.master)||0));cur=a;curPri=PRI[k];const p=a.play();if(p&&p.catch)p.catch(()=>{})}
export function preview(k,master){unlock();const o=cfg.master;cfg={...cfg,master};play(k,true);cfg={...cfg,master:o}}
