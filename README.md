# JAKE — Personal Operating System
### Tuku-Tuku Innovation Labs · Northern Uganda

A living workspace that tracks everything: projects, business pipeline, program calendar, and finances — with Claude AI embedded in every section.

---

## Quick start (Netlify + Supabase)

See **[DEPLOY.md](./DEPLOY.md)** for the full step-by-step guide. Summary:

1. **Supabase** — create a free project, run `supabase-schema.sql` in SQL Editor, grab `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
2. **Netlify** — import your GitHub repo, set build command `cd client && npm install && npm run build`, publish dir `client/dist`
3. **Env vars** — add `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` in Netlify → Site settings → Environment variables
4. **Deploy** — trigger a deploy and your site is live at `https://your-site.netlify.app`

---

## Local development

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

## Modules

| Module | What it does |
|--------|-------------|
| **Dashboard** | Live overview — projects, upcoming deadlines, pipeline spotlight, key stats |
| **Projects** | All workstreams with task checklists and progress tracking |
| **Pipeline** | Kanban board — Prospect → Applied → In Delivery → Active Partner |
| **Calendar** | Month grid + timeline of all program events, milestones, and deadlines |
| **Finance** | Revenue streams, expenses, quarterly target with progress bar |
| **CRM** | Client management with payment tracking and contract value totals |
| **Cash Flow** | 3-month projection from income streams and invoices |
| **Opportunity Radar** | Auto-scanned grant and tender opportunities |
| **Alerts** | Telegram · WhatsApp · Email daily digest at 07:00 EAT |
| **Claude Sync** | Import and search your Claude project contexts |
| **Integrations** | Connect Telegram, Resend, Stripe, Google Calendar, and more |
| **Personal Finance** | SMS-based M-Pesa / Airtel Money transaction tracker |

Each module has a **✦ Ask AI** button that opens a context-aware Claude chat panel pre-loaded with your data.

---

## Updating your data

All seed data lives in `client/src/data/seed.js`. Edit it to:
- Add new projects
- Update pipeline deals
- Add calendar events
- Change financial targets

Data is also persisted to **localStorage** so your changes survive page refreshes, and synced to Supabase for cross-device persistence.

---

## Extending

### Add a new module
1. Create `client/src/modules/YourModule.jsx`
2. Add a nav item in `Sidebar.jsx`
3. Add the route in `App.jsx`

### Adjust AI context
The AI knows your full background from `client/src/api/claude.js`. Edit `BASE_SYSTEM` and `MODULE_CONTEXT` to update what Claude knows.

---

*Built for Jacob Odur · Tuku-Tuku Innovation Labs · Gulu / Lira, Northern Uganda*
