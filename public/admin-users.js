// Vercel serverless function. OWNER ONLY. Creates / removes admins and resets their email or password.
// Needs SUPABASE_SERVICE_ROLE_KEY in the Vercel env vars. That key must stay with the owner and is never sent to the browser.
const J = (res, code, o) => res.status(code).json(o);
export default async function handler(req, res) {
  if (req.method !== "POST") return J(res, 405, { error: "POST only" });
  const { SUPABASE_URL: U, SUPABASE_ANON_KEY: K, SUPABASE_SERVICE_ROLE_KEY: SK } = process.env;
  if (!U || !K) return J(res, 500, { error: "Server env vars missing" });
  if (!SK) return J(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY is not set in Vercel" });

  // 1. who is calling?
  const me = await fetch(U + "/auth/v1/user", { headers: { apikey: K, Authorization: req.headers.authorization || "" } })
    .then(r => r.json()).catch(() => ({}));
  if (!me.id) return J(res, 401, { error: "Login required" });

  const sh = { apikey: SK, Authorization: "Bearer " + SK, "Content-Type": "application/json" };
  const rest = async (path, opt = {}) => { const r = await fetch(U + "/rest/v1/" + path, { ...opt, headers: { ...sh, Prefer: "return=representation", ...(opt.headers || {}) } }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { ok: r.ok, j }; };
  const auth = async (path, method, body) => { const r = await fetch(U + "/auth/v1/admin/" + path, { method, headers: sh, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { ok: r.ok, j }; };

  // 2. must be an owner (checked with the service key, so it cannot be faked from the browser)
  const own = await rest("admins?select=user_id&role=eq.owner&user_id=eq." + encodeURIComponent(me.id));
  if (!own.ok || !Array.isArray(own.j) || !own.j.length) return J(res, 403, { error: "Owner only" });

  const { action, email, password, user_id } = req.body || {};
  const okMail = e => typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const target = async id => { const r = await rest("admins?select=user_id,role&user_id=eq." + encodeURIComponent(id || "")); return Array.isArray(r.j) ? r.j[0] : null; };

  try {
    if (action === "list") {
      const a = await rest("admins?select=user_id,role");
      const users = await auth("users?per_page=200", "GET");
      const map = {}; (users.j.users || []).forEach(u => map[u.id] = u.email);
      return J(res, 200, { admins: (a.j || []).map(x => ({ ...x, email: map[x.user_id] || "" })) });
    }
    if (action === "create") {
      if (!okMail(email)) return J(res, 400, { error: "Enter a valid email" });
      if (!password || password.length < 8) return J(res, 400, { error: "Password must be at least 8 characters" });
      const u = await auth("users", "POST", { email, password, email_confirm: true });
      if (!u.ok) return J(res, 400, { error: u.j.msg || u.j.message || "Could not create user" });
      const r = await rest("admins", { method: "POST", body: JSON.stringify({ user_id: u.j.id, role: "admin" }) });
      if (!r.ok) return J(res, 500, { error: "User created but could not be made admin" });
      return J(res, 200, { ok: true });
    }
    // everything below acts on an existing NON-owner admin
    const t = await target(user_id);
    if (!t) return J(res, 404, { error: "Admin not found" });
    if (t.role === "owner") return J(res, 403, { error: "Owners cannot be changed from here" });

    if (action === "reset") {
      if (!password || password.length < 8) return J(res, 400, { error: "Password must be at least 8 characters" });
      const r = await auth("users/" + user_id, "PUT", { password });
      return r.ok ? J(res, 200, { ok: true }) : J(res, 400, { error: r.j.msg || "Failed" });
    }
    if (action === "setemail") {
      if (!okMail(email)) return J(res, 400, { error: "Enter a valid email" });
      const r = await auth("users/" + user_id, "PUT", { email, email_confirm: true });
      return r.ok ? J(res, 200, { ok: true }) : J(res, 400, { error: r.j.msg || "Failed" });
    }
    if (action === "remove") {
      await rest("admins?user_id=eq." + encodeURIComponent(user_id), { method: "DELETE" });
      await auth("users/" + user_id, "DELETE");
      return J(res, 200, { ok: true });
    }
    return J(res, 400, { error: "Unknown action" });
  } catch (e) {
    return J(res, 500, { error: String(e.message || e).slice(0, 200) });
  }
}
