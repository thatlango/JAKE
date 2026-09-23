# JakeOS Momentum API v1

Canonical production base URL:

`https://momentum.tukutuku.org/api/momentum/v1/`

The same API is also reachable at:

`https://jakeos.tukutuku.org/api/momentum/v1/`

Momentum is the Android execution client. JakeOS/PostgreSQL remains authoritative for work, projects, planning, calendar, estate telemetry and Jake AI context.

## Contract discovery

Authenticated clients may call:

`GET /contract`

The response declares:
- `api_major` — compatibility boundary. Momentum Android supports major version `1`.
- `contract_version` — additive contract revision.
- `identity_authority` — `tuku-core`.
- `authentication` — Tuku access token bearer authentication.
- canonical timezone and workday.
- supported routes.
- work status/priority vocabularies.
- offline/caching guarantees.

Additive fields may be introduced within API major version 1. Existing fields and route semantics must remain backward compatible.

## Authentication

**Tuku Core is the human identity authority. Firebase is not used for Momentum sign-in.**

The auth façade is mounted on the same base URL:

```text
POST /auth/login
POST /auth/refresh
GET  /auth/me
POST /auth/logout
```

Login request:

```json
{"email":"user@example.com","password":"..."}
```

Refresh request:

```json
{"refreshToken":"..."}
```

Successful login and refresh are normalized by JakeOS to:

```json
{
  "data": {
    "session": {
      "accessToken": "...",
      "refreshToken": "...",
      "expiresIn": 3600,
      "expiresAt": 1790170000,
      "tokenType": "Bearer"
    },
    "user": {
      "coreUserId": "...",
      "displayName": "...",
      "email": "...",
      "avatarUrl": "..."
    }
  }
}
```

Protected calls send:

```http
Authorization: Bearer <tuku-access-token>
```

A 401 means the access token is invalid/expired. Android may refresh once and retry once. A repeated 401 or 403 clears the local Momentum session.

## Canonical operating time

- Timezone: `Africa/Kampala`
- Workday: `07:30–18:30`

`GET /day` is the canonical Now/Next contract and is shared with JakeOS Web.

## Endpoints

### Runtime and contract

- `GET /contract` — API compatibility/capability declaration.
- `GET /health` — authenticated API/database status.

### Day and execution

- `GET /day` — canonical current block/task/event, up-next item and merged day timeline.
- `GET /today?limit=7` — ranked actionable work. **Array order is authoritative priority order.**
- `GET /inbox?limit=100` — unprocessed captures.
- `GET /tasks/:id` — canonical task plus recent history.
- `POST /tasks` — create a work item.
- `PATCH /tasks/:id` — update a work item. Send `version` for optimistic concurrency; stale versions receive HTTP 409.
- `POST /tasks/:id/complete` — mark done and clear the scheduled slot.
- `POST /tasks/:id/defer` — defer until an ISO timestamp.
- `POST /capture` — fast Inbox capture. A caller-provided `id` is the idempotency key.

### Projects

- `GET /projects`
- `GET /projects/:id`

Projects are lightweight mobile navigation over canonical JakeOS projects/tasks.

### Schedule and planner

- `GET /schedule?date=YYYY-MM-DD`
- `POST /schedule/items`
- `POST /plan-day`

Preferred Plan Day request:

```json
{
  "date": "2026-09-24",
  "startTime": "07:30",
  "endTime": "18:30",
  "offsetMinutes": 180,
  "limit": 10,
  "commit": true
}
```

Legacy integer `startHour` / `endHour` remain accepted for backward compatibility.

### Jake AI

- `GET /ai/status`
- `GET /chat/history?limit=40`
- `POST /chat`

Chat request:

```json
{"message":"Draft an update and add the follow-up to my work queue."}
```

The response includes the assistant message and may include `actions[]`. When actions create work, Momentum must refresh Today/Inbox/day so the new canonical work is immediately visible.

### Attention and estate

- `GET /pulse` — overdue/blocked work, pipeline/invoice/opportunity/grant deadlines and external attention signals.
- `GET /estate`
- `GET /estate/products/:productCode`

Pulse cards may contain `action_url` and `source_ref`. Task-backed cards should open the exact task. Explicit web URLs may open the JakeOS web surface.

### Devices

- `POST /devices` — register/refresh an FCM token when Firebase messaging is configured. Firebase is optional mobile infrastructure, not identity.

## Work item contract

Canonical work statuses:

`inbox | ready | doing | waiting | done | cancelled`

Canonical priorities:

`low | medium | high | critical`

Core fields:

`id`, `title`, `project_id`, `parent_id`, `description`, `status`, `priority`, `impact`, `strategic_weight`, `estimated_minutes`, `due_at`, `scheduled_start`, `scheduled_end`, `deferred_until`, `blocked`, `blocked_reason`, `pinned`, `context_url`, `source`, `source_ref`, `tags`, `metadata`, `version`.

## Day activity contract

`GET /day` returns activities with `kind`:

- `task` — open the exact task in Focus; `task_id` is canonical.
- `event` — open Schedule/calendar context.
- `block` — open Schedule/day-plan context.

The app must not substitute a different ranked task when a timed `do_now` activity exists.

## Offline and cache semantics

JakeOS/PostgreSQL is the only system of record.

- Today and Inbox render from Room immediately.
- Network refresh replaces canonical lanes **without changing Today rank order**.
- Offline capture is durable: it is stored in the local outbox and remains visible until the idempotent server write succeeds.
- Successful capture is written locally from the server response before any best-effort lane refresh.
- Complete/defer/update require server confirmation; they are not silently queued as if committed.
- Day, Pulse and Estate may fall back to last-successful snapshots.
- Cached Day/Pulse/Estate must be visibly marked stale.
- A stale snapshot must never be presented as a current zero-value snapshot.

## Estate contract

`GET /estate` returns normalized Tuku Core telemetry with freshness metadata:

```json
{
  "configured": true,
  "available": true,
  "stale": false,
  "lastSuccessfulAt": "2026-09-23T15:00:00.000Z",
  "snapshot": {
    "products": [],
    "usageTrend": [],
    "commerce": [],
    "telemetry": [],
    "totals": {},
    "generatedAt": "2026-09-23T15:00:00.000Z"
  }
}
```

Products separate entitlement/reach from observed usage. Commerce separates live/completed orders and realized/pending earnings. Missing telemetry is not equivalent to zero activity.

## Error contract

Safe API failures use:

```json
{"error":"Human-readable message","code":"OPTIONAL_MACHINE_CODE"}
```

Clients should show the safe `error` message when present and retain the HTTP status for diagnostics.

## Cross-work ingestion

Server-to-server ingestion remains separate at `/api/integrations/v1` using `JAKEOS_INGEST_TOKEN`:

- `POST /work-items`
- `POST /signals`
- `PATCH /signals/:id/resolve`

This credential is not a Momentum human session and cannot be used as one.
