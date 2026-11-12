# PSL 2027 Mock Auction – 100% free stack (Supabase Free + Vercel Hobby)
Unofficial, entertainment only. Sample players are DEMO data.

## Setup (no credit card needed)
1. **Supabase:** supabase.com → sign up (GitHub/email) → New project (Free plan). Note: free projects pause after ~1 week of inactivity; open the dashboard and click Restore before your event.
2. **Schema:** SQL Editor → paste all of `supabase/schema.sql` → Run.
3. **Settings:** Authentication → Providers/Sign-in: turn OFF "Allow new users to sign up".
4. **Admin user:** Authentication → Users → Add user (email + password, tick auto-confirm).
5. **Make admin:** SQL Editor → `insert into admins select id from auth.users where email='YOU@EMAIL';`
6. **Config:** Project Settings → API → copy Project URL and `anon public` key into `public/config.js`.
7. **GitHub:** create a free repo, upload this folder. **Vercel:** vercel.com → sign up with GitHub (Hobby plan is free, no card) → Import repo → Deploy. Hobby is for non-commercial use.
8. **Env vars (Vercel → Settings → Environment Variables):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `MAIL_FROM` (see `.env.example`), then Redeploy. Email works without them being perfect: auction runs regardless.
9. Public link: `https://<project>.vercel.app` (share with participants). Admin: `/login.html`.

## What is and isn't fully free/automatic
- **Auction, realtime, Excel, reports, RLS security, history:** fully free.
- **Email (Resend Free):** ~100/day, 3,000/month, no card. BUT the free sender `onboarding@resend.dev` can only email the address you signed up with; emailing other managers requires a verified domain (paid). Free alternatives: the **"Open mail app"** button (mailto, manual), or a free provider that allows single-sender verification (e.g. Brevo) by editing `api/send-email.js`.
- **WhatsApp:** manual only. The **WhatsApp Share** button opens wa.me with the message prepared; you press Send. Nothing is auto-delivered and delivery is not tracked (status shows "Shared manually").
- Timer uses the admin's/viewers' device clocks; small differences are possible.
- Not yet tested against a live Supabase project; run through the checklist after setup.

## Team logins, admin accounts and ownership (update-security.sql)
**Team bidding** now uses a username + password at `/bid.html` (no more secret links).
- Admin panel > **Team Logins** > "Create logins". Passwords are stored encrypted and are shown **once** (copy / WhatsApp / Excel download).
- 5 wrong tries lock that team for 5 minutes. Only one device per team can be logged in; a new login logs the old one out. Sessions last 12 hours.
- "Change" sets your own username/password, "Log out" kicks a team off all devices.
- The old `?team=..&code=..` links no longer work.

**Admin account:** admin panel > **My Account** lets every admin change their own email (confirmation link) and password.

**Owner vs admin (so a client cannot take your project):**
1. Make yourself owner: run the last line of `update-security.sql` with your email.
2. Give the client an *admin* account only (My Account > Owner > "Create admin", or create it yourself). Do NOT give them GitHub, Vercel or Supabase access. Keep those three under your own accounts.
3. In Vercel add env var `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Project Settings > API > service_role). Never put it in any file or share it. It powers the owner-only admin management API.
4. **Site lock** (My Account > Owner): when ON, every non-owner admin and every team is blocked at the database level. Public pages stay read-only. Use it if payment/agreement is not honoured.
5. Admins cannot remove, edit or lock out an owner.

Limit: if someone has the dashboards (GitHub / Vercel / Supabase) or a copy of the code plus their own Supabase project, software cannot stop them. Keeping the database and hosting under YOUR accounts is what keeps control with you.

