# JakeOS — Personal Command Center

JakeOS is Jacob's **system of record and cross-work command center**. It is designed to see the full operating picture across projects, consulting and program delivery, business development, calendar, finances, research, opportunities, relationships and the wider Tuku product estate.

JakeOS is not the lightweight task app. **Momentum** is the companion execution app that consumes JakeOS priorities and lets Jacob work, capture tasks, manage the day and update progress on the go.

## Product boundary

### JakeOS — see and understand everything

JakeOS owns the canonical view of:

- Dashboard / command center
- Projects and workstreams
- Tasks, milestones, dependencies and deadlines
- Program and consulting delivery
- Business-development pipeline
- CRM and relationships
- Calendar and schedule context
- Finance, invoices, cash-flow and revenue signals
- Opportunity intelligence
- Research and weekly evidence briefs
- Alerts, risks and follow-ups
- Connected-work data and AI context

JakeOS should answer questions such as:

- What is happening across all my work?
- What is at risk?
- What deadlines are approaching?
- What decisions do I need to make?
- What work is blocked?
- Where should my attention go this week?
- Which opportunities, clients, projects or payments need action?
- What should Momentum put in front of me next?

### Momentum — execute the day

Momentum is a separate companion product. It should receive a focused, ranked slice of JakeOS rather than reproducing the full command center.

Momentum is responsible for:

- Today / Inbox / Focus views
- Fast capture
- Task creation and editing
- Completing, deferring and rescheduling work
- Day planning
- Calendar-aware task execution
- Mobile notifications
- Lightweight project and JakeOS monitoring
- Offline-first behavior

See `thatlango/Momentum` for the companion app contract.

## Data architecture

**JakeOS is the canonical data authority.**

Target production architecture:

```text
Connected sources / manual capture
             ↓
          JakeOS
             ↓
     PostgreSQL database
             ↓
Dashboards + intelligence + priority engine
             ↓
      JakeOS Momentum API
             ↓
          Momentum
```

The production direction is a VPS-hosted application with PostgreSQL. Netlify and Supabase are legacy dependencies to be removed from the production architecture rather than extended.

Momentum may use Firebase for its mobile concerns, but Firebase must not become a second canonical JakeOS database.

## Core modules

| Module | Purpose |
|---|---|
| **Command Center** | Cross-work operating picture, decisions and attention signals |
| **Projects** | Workstreams, tasks, milestones, owners, status and dependencies |
| **Pipeline** | Consulting, partnerships, proposals and business development |
| **Calendar** | Meetings, deadlines, delivery dates and available execution windows |
| **Finance** | Revenue, expenses, invoices, payments and cash-flow visibility |
| **CRM** | Client/contact relationships, commitments and follow-ups |
| **Opportunity Radar** | Grants, tenders, consulting and strategic opportunities |
| **Research** | MSME/BDS/incubation evidence briefs and saved analysis |
| **Alerts** | Deadline, risk, payment, project and priority alerts |
| **Integrations** | Calendar, email and other approved data connections |
| **AI / Search** | Ask questions across the full JakeOS context |

## Momentum API boundary

JakeOS should expose a narrow execution API for Momentum, beginning with:

```text
GET    /api/momentum/today
GET    /api/momentum/inbox
GET    /api/momentum/pulse
GET    /api/momentum/schedule
POST   /api/momentum/tasks
PATCH  /api/momentum/tasks/:id
POST   /api/momentum/tasks/:id/complete
POST   /api/momentum/tasks/:id/defer
POST   /api/momentum/capture
POST   /api/momentum/plan-day
```

`/today` should not simply return all open tasks. JakeOS should rank candidate work using deadlines, impact, strategic importance, dependencies, schedule availability, workload, carry-over and explicit user priorities, and return an explanation for each recommendation.

## Domains

Recommended separation:

- `jakeos.tukutuku.org` — full JakeOS command center
- `momentum.tukutuku.org` — Momentum companion surface

Both products should share identity and data contracts while remaining distinct user experiences.

---

Built as a personal operating layer for managing work across multiple roles, projects and ventures.
