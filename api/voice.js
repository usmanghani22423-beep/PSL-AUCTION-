// Vercel serverless function: hands out LiveKit voice-room tokens and lets an admin mute / un-mute a person.
// Needs these env vars in Vercel: LIVEKIT_URL (wss://xxxx.livekit.cloud), LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY
import crypto from "crypto";
const ROOM = "psl-voice";
const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const sign = (claims, secret) => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims); return h + "." + p + "." + crypto.createHmac("sha256", secret).update(h + "." + p).digest("base64url"); };
const grant = (key, secret, identity, name, video, hours = 6) => { const now = Math.floor(Date.now() / 1000); return sign({ iss: key, sub: identity, name, nbf: now - 10, exp: now + hours * 3600, video }, secret); };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { SUPABASE_URL: U, SUPABASE_ANON_KEY: K, LIVEKIT_URL: LU, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!LU || !key || !secret) return res.status(500).json({ error: "Voice is not set up yet: add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel" });
  if (!U || !K) return res.status(500).json({ error: "SUPABASE_URL / SUPABASE_ANON_KEY missing in Vercel" });
  const b = req.body || {};
  const rpc = async (fn, args) => (await fetch(U + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json" }, body: JSON.stringify(args) })).json();
  const isAdmin = async () => { const r = await fetch(U + "/rest/v1/admins?select=user_id", { headers: { apikey: K, Authorization: req.headers.authorization || "Bearer x" } }); const j = await r.json().catch(() => null); return Array.isArray(j) && j.length > 0; };
  const rand = () => crypto.randomBytes(5).toString("hex");
  try {
    if (b.action === "mute") {   // admin only: take away / give back the right to speak
      if (!(await isAdmin())) return res.status(403).json({ error: "Admin only" });
      if (!b.identity) return res.status(400).json({ error: "identity missing" });
      const svc = grant(key, secret, "server", "server", { roomAdmin: true, room: ROOM }, 1);
      const r = await fetch(LU.replace(/^wss?:/, "https:") + "/twirp/livekit.RoomService/UpdateParticipant", { method: "POST", headers: { Authorization: "Bearer " + svc, "Content-Type": "application/json" }, body: JSON.stringify({ room: ROOM, identity: b.identity, permission: { can_subscribe: true, can_publish: !!b.allow, can_publish_data: true } }) });
      return r.ok ? res.status(200).json({ ok: true }) : res.status(502).json({ error: "Could not change that person (" + r.status + ")" });
    }
    let identity, name, pub = true;
    if (b.role === "team") {
      if ((await rpc("check_team", { p_team: b.team, p_code: b.code })) !== true) return res.status(401).json({ error: "Please log in again" });
      const t = await (await fetch(U + "/rest/v1/teams?select=name&id=eq." + encodeURIComponent(b.team), { headers: { apikey: K, Authorization: "Bearer " + K } })).json();
      identity = "team-" + b.team; name = (t[0] && t[0].name) || "Team";
    } else if (b.role === "admin") {
      if (!(await isAdmin())) return res.status(401).json({ error: "Admin login needed" });
      identity = "admin-" + rand(); name = "Admin";
    } else if (b.role === "commentary") {
      if ((await rpc("commentary_live", { p_pin: b.pin, p_on: true })) !== true) return res.status(401).json({ error: "Wrong PIN" });
      identity = "commentary"; name = "Commentator";
    } else { identity = "fan-" + rand(); name = "Fan"; pub = false; }
    return res.status(200).json({ token: grant(key, secret, identity, name, { room: ROOM, roomJoin: true, canPublish: pub, canSubscribe: true, canPublishData: pub }), url: LU });
  } catch (e) { return res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
