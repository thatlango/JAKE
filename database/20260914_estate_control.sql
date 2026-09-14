CREATE TABLE IF NOT EXISTS estate_repo_locks (
  repo_id TEXT PRIMARY KEY,
  workstream_id TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'estate-sprint',
  branch TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (state IN ('ACTIVE','VERIFYING','MERGING','DEPLOYING','BLOCKED')),
  lock_token TEXT NOT NULL UNIQUE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_estate_repo_locks_expires ON estate_repo_locks(expires_at);

CREATE TABLE IF NOT EXISTS estate_checkpoints (
  id BIGSERIAL PRIMARY KEY,
  repo_id TEXT NOT NULL,
  workstream_id TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '',
  commit_sha TEXT NOT NULL,
  checkpoint_type TEXT NOT NULL DEFAULT 'pushed'
    CHECK (checkpoint_type IN ('pushed','pr','merged','migration','artifact','deployed','blocked')),
  pr_number INTEGER,
  ci_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (ci_status IN ('unknown','pending','success','failure')),
  tests JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_estate_checkpoints_repo ON estate_checkpoints(repo_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estate_checkpoints_workstream ON estate_checkpoints(workstream_id,created_at DESC);

CREATE TABLE IF NOT EXISTS estate_releases (
  id BIGSERIAL PRIMARY KEY,
  repo_id TEXT NOT NULL,
  product_code TEXT NOT NULL DEFAULT '',
  environment TEXT NOT NULL DEFAULT 'production',
  source_sha TEXT NOT NULL,
  artifact_type TEXT NOT NULL DEFAULT '',
  artifact_version TEXT NOT NULL DEFAULT '',
  artifact_ref TEXT NOT NULL DEFAULT '',
  deploy_ref TEXT NOT NULL DEFAULT '',
  ci_status TEXT NOT NULL DEFAULT 'success'
    CHECK (ci_status IN ('unknown','pending','success','failure')),
  smoke_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (smoke_status IN ('unknown','pending','success','failure')),
  rollback_ref TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_estate_releases_repo ON estate_releases(repo_id,created_at DESC);

CREATE TABLE IF NOT EXISTS estate_control_events (
  id BIGSERIAL PRIMARY KEY,
  repo_id TEXT NOT NULL DEFAULT '',
  workstream_id TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'estate-sprint',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_estate_control_events_repo ON estate_control_events(repo_id,created_at DESC);
