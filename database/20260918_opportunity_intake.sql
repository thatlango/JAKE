CREATE TABLE IF NOT EXISTS opportunity_intake (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  source TEXT NOT NULL DEFAULT 'external',
  idempotency_key TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','completed','duplicate','failed','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  opportunity_id TEXT,
  result JSONB,
  last_error TEXT,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_intake_idempotency_key_idx ON opportunity_intake(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS opportunity_intake_ready_idx ON opportunity_intake(state,available_at,created_at);
CREATE INDEX IF NOT EXISTS opportunity_intake_opportunity_idx ON opportunity_intake(opportunity_id);
