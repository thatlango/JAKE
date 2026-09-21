CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  context_type TEXT,
  context_ref TEXT,
  current_agent TEXT,
  blockers_count INTEGER NOT NULL DEFAULT 0,
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status_updated ON agent_runs(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_context ON agent_runs(context_type,context_ref);

CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  state TEXT,
  summary TEXT NOT NULL,
  artifact_ref TEXT,
  requires_human_action BOOLEAN NOT NULL DEFAULT FALSE,
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedupe_key TEXT UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_events_run_time ON agent_events(run_id,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent_time ON agent_events(agent_id,event_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_attention ON agent_events(requires_human_action,event_at DESC);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id TEXT,
  name TEXT NOT NULL,
  artifact_type TEXT NOT NULL DEFAULT 'evidence',
  uri TEXT NOT NULL,
  evidence_kind TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_artifacts_run ON agent_artifacts(run_id,created_at DESC);

CREATE TABLE IF NOT EXISTS agent_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  recommendation TEXT NOT NULL DEFAULT '',
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_at TIMESTAMPTZ,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_open ON agent_decisions(status,priority,due_at);
