ALTER TABLE agent_work_dispatches
  ADD COLUMN IF NOT EXISTS executor_preference TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS remote_executable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS approval_policy TEXT NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS tool_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS execution_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pending_action JSONB,
  ADD COLUMN IF NOT EXISTS approved_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS response_id TEXT,
  ADD COLUMN IF NOT EXISTS response_state TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS max_cost_usd NUMERIC(12,4) NOT NULL DEFAULT 2.0000,
  ADD COLUMN IF NOT EXISTS spent_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_tool_calls INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS tool_calls_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trace JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE agent_work_dispatches DROP CONSTRAINT IF EXISTS agent_work_dispatches_state_check;
ALTER TABLE agent_work_dispatches
  ADD CONSTRAINT agent_work_dispatches_state_check
  CHECK (state IN ('queued','working','approval','review','blocked','failed','completed','cancelled'));

ALTER TABLE agent_work_dispatches DROP CONSTRAINT IF EXISTS agent_work_dispatches_executor_preference_check;
ALTER TABLE agent_work_dispatches
  ADD CONSTRAINT agent_work_dispatches_executor_preference_check
  CHECK (executor_preference IN ('auto','local','openai','external'));

ALTER TABLE agent_work_dispatches DROP CONSTRAINT IF EXISTS agent_work_dispatches_approval_policy_check;
ALTER TABLE agent_work_dispatches
  ADD CONSTRAINT agent_work_dispatches_approval_policy_check
  CHECK (approval_policy IN ('auto','evidence','external','executive'));

CREATE INDEX IF NOT EXISTS idx_agent_work_remote_queue
  ON agent_work_dispatches(state,executor_preference,remote_executable,created_at);

CREATE TABLE IF NOT EXISTS agent_tool_audit (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL REFERENCES agent_work_dispatches(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_scope TEXT NOT NULL,
  action_class TEXT NOT NULL,
  action_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  request JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary TEXT NOT NULL DEFAULT '',
  decision_id TEXT REFERENCES agent_decisions(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(dispatch_id,action_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_run ON agent_tool_audit(run_id,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_audit_status ON agent_tool_audit(status,started_at DESC);

CREATE TABLE IF NOT EXISTS agent_artifact_versions (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL REFERENCES agent_work_dispatches(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  agent_id TEXT,
  name TEXT NOT NULL,
  artifact_type TEXT NOT NULL DEFAULT 'deliverable',
  media_type TEXT NOT NULL DEFAULT 'text/plain',
  content_text TEXT,
  content_json JSONB,
  storage_uri TEXT,
  sha256 TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  source_tool TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dispatch_id,name,version)
);
CREATE INDEX IF NOT EXISTS idx_agent_artifact_versions_dispatch ON agent_artifact_versions(dispatch_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_artifact_versions_run ON agent_artifact_versions(run_id,created_at DESC);

CREATE TABLE IF NOT EXISTS agent_notifications (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT REFERENCES agent_work_dispatches(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivery JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_notifications_pending ON agent_notifications(status,created_at);

CREATE TABLE IF NOT EXISTS agent_executor_capabilities (
  executor_id TEXT PRIMARY KEY,
  executor_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  model TEXT,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
