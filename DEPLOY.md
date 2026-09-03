# JakeOS VPS Deployment

JakeOS runs as a long-running Node/Express application with a private PostgreSQL database. Netlify and Supabase are not part of the production runtime.

## Services

- `jakeos-web` — React build + Express API
- `jakeos-db` — PostgreSQL 17, internal Docker network only
- Caddy/shared edge — HTTPS and domain routing
- Tuku Core — human identity authority and estate telemetry source

## Required production configuration

Store secrets outside the repository, e.g. `/opt/tuku/secrets/jakeos.env`.

Required:

```env
NODE_ENV=production
PUBLIC_URL=https://jakeos.tukutuku.org
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://jakeos:<password>@jakeos-db:5432/jakeos
JAKEOS_INGEST_TOKEN=<strong-random-token>

# Human authentication
TUKU_CORE_INTERNAL_URL=http://tuku-core-api:3000
TUKU_AUTH_PUBLIC_URL=https://core.tukutuku.org
JAKEOS_TUKU_REDIRECT_URI=https://jakeos.tukutuku.org/auth/tuku/callback
JAKEOS_ALLOWED_CORE_USER_IDS=<authorized-core-user-id>
JAKEOS_SESSION_SECRET=<strong-random-secret>
JAKEOS_SESSION_TTL_SECONDS=43200
```

Momentum uses the same Tuku identity. Its login/refresh endpoints delegate to Tuku Core, and protected Momentum APIs validate the Tuku access token against Core. Firebase may still be configured separately for FCM/mobile telemetry, but it is not the human identity authority.

Optional integrations:

```env
ANTHROPIC_API_KEY=
GROQ_API_KEY=
SMS_WEBHOOK_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://jakeos.tukutuku.org/auth/google/callback
```

Google refresh tokens are stored in JakeOS PostgreSQL after OAuth rather than copied into deployment environment variables.

## Deploy

**Always pass the production env file to Compose.** Compose variable interpolation happens before a service-level `env_file` is read; omitting `--env-file` can therefore substitute a blank PostgreSQL password into `DATABASE_URL`.

```bash
docker compose --env-file /opt/tuku/secrets/jakeos.env -f compose.yml build
docker compose --env-file /opt/tuku/secrets/jakeos.env -f compose.yml up -d
```

The container runs `server/migrate.js` before `server/index.js`; `database/schema.sql` is idempotent.

Route Caddy/edge traffic for `jakeos.tukutuku.org` to `jakeos-web:3000` on the shared edge network. Do not put HTTP Basic Auth in front of JakeOS; the application presents the Tuku Auth gate itself. Keep `/api/sms/receive` protected by its dedicated webhook secret.

## Health and auth checks

- `/health` — public application/database health
- `/auth/tuku/start` — starts JakeOS PKCE handoff to Tuku Auth
- `/auth/session` — current JakeOS Tuku-derived browser session
- `/api/momentum/v1/auth/login` — Momentum login via Tuku Core
- `/api/momentum/v1/auth/refresh` — Momentum token refresh via Tuku Core
- `/api/momentum/v1/auth/me` — authenticated Momentum identity
- `/api/momentum/v1/health` — authenticated Momentum API health

Unauthenticated JakeOS data APIs and Momentum data APIs must return HTTP 401.

## Momentum

Momentum is a client of JakeOS, not a second database authority. See `docs/MOMENTUM_API.md` for the mobile contract and `/api/integrations/v1` for server-to-server ingestion from other work systems.
