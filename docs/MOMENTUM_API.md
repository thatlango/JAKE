# JakeOS Momentum API v1

Preferred mobile base URL after DNS cutover: `https://momentum.tukutuku.org/api/momentum/v1`

The same API is also reachable from the JakeOS host at `https://jakeos.tukutuku.org/api/momentum/v1`. The Momentum hostname is a narrow companion/API surface and does not expose the full JakeOS dashboard.

## Authentication
Momentum sends `Authorization: Bearer <firebase-id-token>`. JakeOS validates the Firebase RS256 signature, project audience, issuer and expiry using `MOMENTUM_FIREBASE_PROJECT_ID`. Optional `MOMENTUM_ALLOWED_UIDS` / `MOMENTUM_ALLOWED_EMAILS` restrict access further. `MOMENTUM_API_TOKEN` is a development/emergency fallback only when Firebase verification is not configured.

JakeOS/PostgreSQL is authoritative. Momentum can cache locally for fast/offline use, but writes sync back to JakeOS and use `version` for optimistic conflict detection.

## Momentum endpoints
- `GET /health` — authenticated API/database status
- `GET /today?limit=7` — ranked actionable work with `why_now`
- `GET /inbox` — unprocessed captures
- `GET /tasks/:id` — task plus recent history
- `POST /tasks` — create work item
- `PATCH /tasks/:id` — update; send `version` to receive HTTP 409 on conflicts
- `POST /tasks/:id/complete` — complete and clear scheduled slot
- `POST /tasks/:id/defer` — defer until an ISO timestamp
- `POST /capture` — fast Inbox capture
- `GET /schedule?date=YYYY-MM-DD` — calendar plus scheduled tasks
- `POST /plan-day` — rank work and allocate it around occupied calendar/task blocks; `commit:true` persists slots
- `GET /pulse` — overdue/blocked work, pipeline deadlines, overdue invoices, opportunity deadlines and external attention signals
- `GET /estate` — Tuku estate usage, growth, orders and earnings snapshot
- `POST /devices` — register/refresh an FCM device token

## Work item fields
`title`, `project_id`, `parent_id`, `description`, `status`, `priority`, `impact`, `strategic_weight`, `estimated_minutes`, `due_at`, `scheduled_start`, `scheduled_end`, `deferred_until`, `blocked`, `blocked_reason`, `pinned`, `context_url`, `source`, `source_ref`, `tags`, `metadata`, `version`.

## Estate contract
`GET /estate` returns the same normalized Tuku Core snapshot used by JakeOS desktop, wrapped with freshness metadata:

```json
{
  "configured": true,
  "available": true,
  "stale": false,
  "lastSuccessfulAt": "2026-09-03T15:00:00.000Z",
  "snapshot": {
    "products": [],
    "usageTrend": [],
    "commerce": [],
    "totals": {},
    "measurement": {},
    "generatedAt": "2026-09-03T15:00:00.000Z"
  }
}
```

Each `products[]` record contains:
- `code`, `name`
- `reach.organizations`, `reach.users` — access/entitlement, not activity
- `activeUsers24h`, `activeUsers7d`, `activeUsers30d`
- `newUsers7d`
- `growth7dPercent` — distinct active users in the last 7 days vs preceding 7 days
- `usageEvents7d`, `usageEventsPrevious7d`
- `lastActivityAt`

Each `commerce[]` record contains:
- `productCode`, `currency`
- `orders.total`, `orders.active`, `orders.completed`, `orders.cancelled`
- product-specific workflow counts where available
- `earnings.realized`, `earnings.pending`, `earnings.fulfilledGross`
- `lastOrderAt`

Kela additionally exposes `orders.new`, `sourcing`, `shopping`, `consolidation`, `ready`, and `outForDelivery`. Kela realized earnings are completed-order service fees; pending earnings are service fees attached to active, non-cancelled orders.

Momentum should cache the last successful snapshot and visibly show stale/freshness state rather than replacing data with zeroes after a transient failure.

## Cross-work ingestion
Base URL: `/api/integrations/v1` with `Authorization: Bearer <JAKEOS_INGEST_TOKEN>`.

- `POST /work-items` — idempotent ingestion using `source + source_ref`
- `POST /signals` — create/update a JakeOS attention signal
- `PATCH /signals/:id/resolve` — resolve a signal

## Priority model
The first production model is deterministic and explainable. It considers explicit priority, impact, strategic weight, deadline proximity/overdue state, manual pinning, task age/carry-over, in-progress continuity, effort/quick wins, fit before the next calendar commitment, blockers and deferrals. Blocked/waiting and future-deferred tasks do not appear in Today.

## Recommended Momentum presentation
Keep the companion decision-oriented:
- **Today:** 5–7 ranked actions plus calendar context
- **Inbox:** captures needing processing
- **Focus:** one active task and its JakeOS context
- **Schedule:** commitments plus planned work
- **Pulse:** only risks/signals needing attention
- **Estate:** product usage/growth cards and Orders & Earnings
- **Capture:** task/note/follow-up/deadline in seconds

Do not reproduce the full JakeOS command-center dashboard in Momentum.
