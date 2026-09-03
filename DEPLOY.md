# JakeOS VPS Deployment

JakeOS runs as a long-running Node/Express application with a private PostgreSQL database. Netlify and Supabase are not part of the production runtime.

## Services

- `jakeos-web` — React build + Express API
- `jakeos-db` — PostgreSQL 17, internal Docker network only
- Caddy/shared edge — HTTPS and domain routing

## Required production configuration

Store secrets outside the repository, e.g. `/opt/tuku/secrets/jakeos.env`.

Required:

```env
NODE_ENV=production
PUBLIC_URL=https://jakeos.tukutuku.org
POSTGRES_PASSWORD=<strong-password>
DATABASE_URL=postgresql://jakeos:<password>@jakeos-db:5432/jakeos
JAKEOS_INGEST_TOKEN=<strong-random-token>
MOMENTUM_FIREBASE_PROJECT_ID=<firebase-project-id>
```

Recommended for this personal deployment:

```env
MOMENTUM_ALLOWED_UIDS=<firebase-uid>
# or MOMENTUM_ALLOWED_EMAILS=<authorized-email>
```

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

```bash
docker compose --env-file /opt/tuku/secrets/jakeos.env -f compose.yml build
docker compose --env-file /opt/tuku/secrets/jakeos.env -f compose.yml up -d
```

The container runs `server/migrate.js` before `server/index.js`; `database/schema.sql` is idempotent.

Route Caddy/edge traffic for `jakeos.tukutuku.org` to `jakeos-web:3000` on the shared `tuku-edge` network.

## Health checks

- `/health` — application/database health
- `/api/health` — JakeOS API health
- `/api/momentum/v1/health` — authenticated Momentum API health

## Momentum

Momentum is a client of JakeOS, not a second database authority. See `docs/MOMENTUM_API.md` for the mobile contract and `/api/integrations/v1` for server-to-server ingestion from other work systems.
