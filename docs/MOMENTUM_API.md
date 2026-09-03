# JakeOS Momentum API v1

Base URL: `https://jakeos.tukutuku.org/api/momentum/v1`

## Authentication
Momentum sends `Authorization: Bearer <firebase-id-token>`. JakeOS validates the Firebase RS256 signature, project audience, issuer and expiry using `MOMENTUM_FIREBASE_PROJECT_ID`. Optional `MOMENTUM_ALLOWED_UIDS` / `MOMENTUM_ALLOWED_EMAILS` restrict access further. `MOMENTUM_API_TOKEN` is a fallback only when Firebase verification is not configured.

JakeOS/PostgreSQL is authoritative. Momentum can cache locally, but writes sync back to JakeOS and use `version` for optimistic conflict detection.

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
- `POST /devices` — register/refresh an FCM device token

## Work item fields
`title`, `project_id`, `parent_id`, `description`, `status`, `priority`, `impact`, `strategic_weight`, `estimated_minutes`, `due_at`, `scheduled_start`, `scheduled_end`, `deferred_until`, `blocked`, `blocked_reason`, `pinned`, `context_url`, `source`, `source_ref`, `tags`, `metadata`, `version`.

## Cross-work ingestion
Base URL: `/api/integrations/v1` with `Authorization: Bearer <JAKEOS_INGEST_TOKEN>`.

- `POST /work-items` — idempotent ingestion using `source + source_ref`
- `POST /signals` — create/update a JakeOS attention signal
- `PATCH /signals/:id/resolve` — resolve a signal

## Priority model
The first production model is deterministic and explainable. It considers explicit priority, impact, strategic weight, deadline proximity/overdue state, manual pinning, task age/carry-over, in-progress continuity, effort/quick wins, fit before the next calendar commitment, blockers and deferrals. Blocked/waiting and future-deferred tasks do not appear in Today.
