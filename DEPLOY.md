# JAKE — Netlify Deployment Guide
**From zero to live in ~20 minutes. Totally free.**

---

## What runs where

| Layer | Service | Cost |
|-------|---------|------|
| Frontend (React PWA) | Netlify Static Hosting | Free |
| Backend (API routes) | Netlify Serverless Functions | Free (125K req/month) |
| Cron jobs | Netlify Scheduled Functions | Free |
| Database | Supabase (PostgreSQL) | Free (500MB) |
| AI | Anthropic Claude API | Pay per use |
| Alerts | Telegram Bot API | Free |
| Email | Resend | Free (3,000/month) |
| Google Calendar | Google Calendar API | Free (1M req/day) |

---

## Step 1 — Supabase database (5 minutes)

1. Go to **supabase.com** → Create account (free, no card)
2. **New project** → name it `jake` → pick a password → region: **East Africa (Bahrain is closest)**
3. Wait ~2 minutes for provisioning
4. Go to **SQL Editor** → **New query**
5. Paste the entire contents of `supabase-schema.sql` → click **Run**
6. You should see: `JAKE database initialised successfully! 🚀`
7. Go to **Project Settings → API**:
   - Copy **Project URL** → this is your `SUPABASE_URL`
   - Copy **service_role** key (under Project API keys) → this is your `SUPABASE_SERVICE_KEY`
   - ⚠️ Use service_role, NOT anon key — service_role bypasses RLS for server-side use

---

## Step 2 — Netlify project (3 minutes)

1. Go to **netlify.com** → Sign up free with GitHub
2. **Add new site → Import an existing project → GitHub**
3. Push the `jake` folder to a GitHub repo first:
   ```bash
   cd jake
   git init
   git add .
   git commit -m "JAKE v4"
   gh repo create jake --private --push --source=.
   ```
4. Select your `jake` repo in Netlify
5. Build settings are auto-detected from `netlify.toml`:
   - Build command: `cd client && npm install && npm run build`
   - Publish directory: `client/dist`
   - Functions directory: `netlify/functions`
6. **Don't deploy yet** — add env vars first

---

## Step 3 — Environment variables (3 minutes)

In Netlify → **Site settings → Environment variables → Add variable**:

### Required
```
ANTHROPIC_API_KEY      = sk-ant-...        (from console.anthropic.com)
SUPABASE_URL           = https://xxx.supabase.co
SUPABASE_SERVICE_KEY   = eyJ...            (service_role key, NOT anon)
```

### Alerts (optional but recommended)
```
TELEGRAM_BOT_TOKEN     = 123456789:ABC...  (@BotFather on Telegram)
TELEGRAM_CHAT_ID       = 123456789         (@userinfobot on Telegram)
RESEND_API_KEY         = re_...            (resend.com, free)
ALERT_FROM_EMAIL       = jake@yourdomain.com
ALERT_TO_EMAIL         = you@gmail.com
```

### Google Calendar (optional)
```
GOOGLE_CLIENT_ID       = xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET   = GOCSPX-...
GOOGLE_REDIRECT_URI    = https://your-site.netlify.app/auth/google/callback
GOOGLE_REFRESH_TOKEN   = (from first OAuth login — see Step 5)
GOOGLE_USER_EMAIL      = you@gmail.com
```

### SMS Webhook
```
SMS_WEBHOOK_SECRET     = (any strong random string)
```

---

## Step 4 — Deploy

In Netlify → **Deploys → Trigger deploy → Deploy site**

Wait ~2 minutes. Your site is live at `https://your-site.netlify.app`

---

## Step 5 — Connect Google Calendar

1. Go to **Google Cloud Console** → New project → Enable Calendar API
2. Create OAuth 2.0 credentials (Web Application)
3. Add authorized redirect URI: `https://your-site.netlify.app/auth/google/callback`
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to Netlify env vars
5. Visit `https://your-site.netlify.app/auth/google` → login → copy the refresh token
6. Add `GOOGLE_REFRESH_TOKEN` to Netlify env vars → redeploy

---

## Step 6 — Custom domain (optional, free)

Netlify → **Domain settings → Add custom domain**
- Add your domain, e.g. `jake.tukutuku.ug`
- Netlify provides free SSL automatically

---

## Local development

For local dev, the Vite proxy routes `/api/*` to the Express server:

```bash
npm run setup   # install all deps
npm run dev     # runs Express (port 3001) + Vite (port 5173) together
```

Set env vars in a `.env` file at the root:
```
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

---

## Cost breakdown (all free on Netlify free tier)

- **Bandwidth**: 100GB/month free → JAKE uses <1GB
- **Serverless function calls**: 125,000/month free → JAKE uses <5,000
- **Build minutes**: 300/month free → each deploy uses ~2 minutes
- **Scheduled functions**: included free

Supabase free tier:
- 500MB database → JAKE uses <10MB
- Unlimited API requests
- 2GB bandwidth

**Your only cost is Claude API usage** (~$0.003 per message at Sonnet rates).

---

## File structure (what goes to Netlify vs stays local)

```
jake/
├── netlify.toml          ← Build config + redirects
├── netlify/functions/    ← Serverless backend
│   ├── api.js            ← All /api/* routes
│   ├── auth-start.js     ← /auth/google
│   ├── auth-callback.js  ← /auth/google/callback
│   ├── share-target.js   ← PWA share sheet
│   ├── cron-daily.js     ← 07:00 EAT daily digest
│   └── cron-radar.js     ← Every 6h opportunity scan
├── server/               ← Shared logic (used by functions)
│   ├── db.js             ← Supabase client
│   ├── alerts.js         ← Telegram + Resend
│   ├── gcal.js           ← Google Calendar OAuth
│   ├── crm.js            ← Client CRM logic
│   ├── invoices.js       ← Invoice generation
│   ├── radar.js          ← Opportunity scanner
│   └── sms-parser.js     ← SMS transaction parser
├── client/               ← React PWA (built to client/dist)
└── supabase-schema.sql   ← Run once in Supabase SQL editor
```
