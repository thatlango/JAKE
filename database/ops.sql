CREATE TABLE IF NOT EXISTS ops_hosts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  hostname TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_host_metrics (
  id BIGSERIAL PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES ops_hosts(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cpu_percent NUMERIC,
  memory_percent NUMERIC,
  disk_percent NUMERIC,
  load1 NUMERIC,
  load5 NUMERIC,
  load15 NUMERIC,
  uptime_seconds BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ops_host_metrics_host_time ON ops_host_metrics(host_id,captured_at DESC);

CREATE TABLE IF NOT EXISTS ops_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'http',
  critical BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_status INTEGER,
  last_latency_ms INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  last_ok_at TIMESTAMPTZ,
  tls_expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ops_service_checks (
  id BIGSERIAL PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES ops_services(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_code INTEGER,
  latency_ms INTEGER,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ops_service_checks_service_time ON ops_service_checks(service_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS ops_domains (
  id TEXT PRIMARY KEY,
  host TEXT NOT NULL UNIQUE,
  root_domain TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'subdomain',
  product TEXT NOT NULL DEFAULT '',
  registrar TEXT,
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN,
  tls_expires_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_domains_expiry ON ops_domains(expires_at,tls_expires_at);

CREATE TABLE IF NOT EXISTS ops_backups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unknown',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
