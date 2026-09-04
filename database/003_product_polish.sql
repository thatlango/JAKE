CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Consulting Proposal',
  client TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL DEFAULT '',
  deal_id TEXT,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposals_status_updated ON proposals(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS grant_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  funder TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  type TEXT NOT NULL DEFAULT 'Grant',
  sector TEXT NOT NULL DEFAULT 'Other',
  stage TEXT NOT NULL DEFAULT 'Identified',
  deadline TEXT,
  contact TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  context TEXT NOT NULL DEFAULT '',
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grant_items_stage_deadline ON grant_items(stage, deadline);
