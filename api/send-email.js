// Vercel serverless function (free on Hobby). Only logged-in admins may call it. Resend key stays server-side.
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pkr=n=>"Rs. "+Number(n).toLocaleString("en-PK");
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"POST only"});
 const {SUPABASE_URL:U,SUPABASE_ANON_KEY:K,RESEND_API_KEY:R,MAIL_FROM:F}=process.env;
 if(!U||!K)return res.status(500).json({error:"Server env vars missing"});
 const h={apikey:K,Authorization:req.headers.authorization||""};
 const get=async p=>{const r=await fetch(U+"/rest/v1/"+p,{headers:h});const j=await r.json();return Array.isArray(j)?j:[]};
 const me=await fetch(U+"/auth/v1/user",{headers:h}).then(r=>r.json()).catch(()=>({}));
 if(!me.id)return res.status(401).json({error:"Login required"});
 if(!(await get("admins?select=user_id&user_id=eq."+me.id)).length)return res.status(403).json({error:"Not an admin"});
 const {playerId,force}=req.body||{},id=encodeURIComponent(playerId||"");
 const [p]=await get("players?id=eq."+id);if(!p||p.status!=="Sold")return res.status(404).json({error:"Sold player not found"});
 const [t]=await get("teams?id=eq."+p.team_id),[c]=await get("team_contacts?team_id=eq."+p.team_id),[n]=await get("notifications?player_id=eq."+id);
 if(n?.email_status==="Sent"&&!force)return res.json({skipped:"already sent"});
 const patch=(email_status,email_error)=>fetch(U+"/rest/v1/notifications?player_id=eq."+id,{method:"PATCH",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify({email_status,email_error,updated_at:new Date().toISOString()})});
 if(!c?.email_pref||!c?.email){await patch("Skipped","Email disabled or no address");return res.json({skipped:"disabled"})}
 if(!R){await patch("Failed","RESEND_API_KEY not configured");return res.status(500).json({error:"RESEND_API_KEY not configured"})}
 const rows=[["Player",p.name],["Role",p.role],["Country",p.country],["Final price",pkr(p.sold_price)],["Team",t.name],["Remaining budget",pkr(t.purse-t.spent)],["Auction time",new Date(p.sold_at).toLocaleString("en-PK",{timeZone:"Asia/Karachi"})]];
 const html=`<div style="font-family:Arial;background:#101820;padding:24px"><div style="max-width:520px;margin:auto;background:#1D2D38;border-top:5px solid #16A36A;border-radius:10px;color:#fff;padding:24px"><h2 style="color:#D4AF37;margin:0">🏏 PSL 2027 MOCK AUCTION</h2><h3>Congratulations ${esc(t.name)}!</h3><table style="width:100%;color:#fff">${rows.map(([a,b])=>`<tr><td style="padding:6px 0;color:#B8C5CE">${a}</td><td><b>${esc(b)}</b></td></tr>`).join("")}</table><p style="color:#B8C5CE;font-size:12px">Mock auction for entertainment. Not an official PSL communication.</p></div></div>`;
 const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+R,"Content-Type":"application/json"},body:JSON.stringify({from:F||"onboarding@resend.dev",to:[c.email],subject:"PSL 2027 Mock Auction – Player Purchased!",html})});
 const j=await r.json();
 if(!r.ok){await patch("Failed",String(j.message||"Resend error").slice(0,300));return res.status(502).json({error:j.message||"Resend error"})}
 await patch("Sent",null);return res.json({ok:true});
}
