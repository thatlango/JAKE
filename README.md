# JAKE — Personal Operating System
### Tuku-Tuku Innovation Labs · Northern Uganda

A living workspace that tracks everything: projects, business pipeline, program calendar, and finances — with Claude AI embedded in every section.

---

## Setup on Replit

### 1. Create a new Replit project
- Go to [replit.com](https://replit.com) → **Create Repl**
- Choose **Node.js** template
- Name it `jake`

### 2. Upload these files
Drag and drop the entire `jake` folder contents into the Replit file tree. Make sure the structure looks like this:
```
jake/
├── .replit
├── package.json
├── server/
│   └── index.js
└── client/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css
        ├── api/
        │   └── claude.js
        ├── components/
        │   ├── Sidebar.jsx
        │   └── AIPanel.jsx
        ├── data/
        │   └── seed.js
        └── modules/
            ├── Dashboard.jsx
            ├── Projects.jsx
            ├── Pipeline.jsx
            ├── Calendar.jsx
            └── Finance.jsx
```

### 3. Add your Anthropic API Key
- In Replit: go to **Tools → Secrets**
- Add a secret: `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)

### 4. Add Supabase credentials (required for clients/projects/prospects persistence)
- In Replit **Secrets** or Netlify **Site configuration → Environment variables**, add:
  - `SUPABASE_URL` = your Supabase project URL (`https://<project-ref>.supabase.co`)
  - `SUPABASE_SERVICE_KEY` = your Supabase service role key (**recommended**)
- Optional fallback (less privileged): `SUPABASE_ANON_KEY`
- Optional: `SUPABASE_CONNECTION_STRING` (Postgres URI) if you want JAKE to auto-derive `SUPABASE_URL` from your `db.<project-ref>.supabase.co` host.

> If you only have a **database password**, that is for direct Postgres connections and is **not used** by this app’s Supabase API client.  
> You still need `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (or `SUPABASE_ANON_KEY`).

Example connection string format:
```bash
postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres
```

### 5. Install and run
Open the Replit Shell and run:
```bash
npm run setup   # installs all dependencies
npm run start   # starts both server + client
```

Optional Supabase tooling:
```bash
npx skills add supabase/agent-skills
```

The app opens in the Replit webview. The Express server runs on port 3001, the React app on 5173.

---

## What's in v1

| Module | What it does |
|--------|-------------|
| **Dashboard** | Live overview — projects, upcoming events, pipeline spotlight, key stats |
| **Projects** | All 5 workstreams with task checklists (Radar, Synced, Ajura, 4Africa, Tuku-Tuku) |
| **Pipeline** | Kanban board — Prospect → Applied → In Delivery → Active Partner |
| **Calendar** | Timeline of all program events, milestones, and deadlines |
| **Finance** | Revenue streams, expenses, quarterly target with progress bar |

Each module has a **✦ Ask AI** button that opens a context-aware Claude chat panel pre-loaded with your data.

---

## Updating your data

All data lives in `client/src/data/seed.js`. Edit it to:
- Add new projects
- Update pipeline deals
- Add calendar events
- Change financial targets

Data is also persisted to **localStorage** so your checkbox changes (tasks, calendar events) survive page refreshes.

To reset to seed data: open browser DevTools → Application → Local Storage → clear all `jos_*` keys.

---

## Extending

### Add a new module
1. Create `client/src/modules/YourModule.jsx`
2. Add a nav item in `Sidebar.jsx`
3. Add the route in `App.jsx`
4. Add context-aware quick prompts in `AIPanel.jsx`

### Add new AI prompts
Edit the `QUICK_PROMPTS` object in `AIPanel.jsx` — one array per module key.

### Adjust AI context
The AI knows your full background from `client/src/api/claude.js`. Edit `BASE_SYSTEM` and `MODULE_CONTEXT` to update what Claude knows.

---

## Roadmap ideas for v2
- [ ] Google Calendar sync
- [ ] Add/edit pipeline deals via form
- [ ] Add new tasks inline
- [ ] Supabase backend (replace localStorage)
- [ ] Mobile responsive layout
- [ ] Email/WhatsApp notifications for deadlines
- [ ] Radar + Synced dev metrics integration

---

*Built for Jacob Odur · Tuku-Tuku Innovation Labs · Gulu / Lira, Northern Uganda*
