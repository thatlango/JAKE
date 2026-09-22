CREATE TABLE IF NOT EXISTS agent_work_dispatches (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL UNIQUE REFERENCES work_items(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE REFERENCES agent_runs(id) ON DELETE CASCADE,
  request_key TEXT UNIQUE,
  requested_agent_id TEXT NOT NULL,
  requested_agent_name TEXT NOT NULL,
  request_text TEXT NOT NULL,
  deliverable_type TEXT NOT NULL DEFAULT 'draft',
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','working','review','blocked','failed','completed','cancelled')),
  executor_id TEXT,
  local_executable BOOLEAN NOT NULL DEFAULT FALSE,
  lease_expires_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_summary TEXT,
  result_content TEXT,
  artifact_uri TEXT,
  failure_reason TEXT,
  feedback_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  requested_by TEXT NOT NULL DEFAULT 'jake',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_work_dispatches_state ON agent_work_dispatches(state, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_work_dispatches_agent ON agent_work_dispatches(requested_agent_id, state);
CREATE INDEX IF NOT EXISTS idx_agent_work_dispatches_lease ON agent_work_dispatches(state, lease_expires_at);
