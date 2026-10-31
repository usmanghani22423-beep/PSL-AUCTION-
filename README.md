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
