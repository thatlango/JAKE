CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT DEFAULT '📁', description TEXT DEFAULT '', tech TEXT DEFAULT '',
  status TEXT DEFAULT 'Planning', priority TEXT DEFAULT 'Medium', color TEXT DEFAULT '#5C6680', progress INTEGER DEFAULT 0,
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, text TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE, position INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;
CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, parent_id TEXT REFERENCES work_items(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'inbox', priority TEXT NOT NULL DEFAULT 'medium',
  impact SMALLINT NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5), strategic_weight SMALLINT NOT NULL DEFAULT 3 CHECK (strategic_weight BETWEEN 1 AND 5),
  estimated_minutes INTEGER NOT NULL DEFAULT 30 CHECK (estimated_minutes BETWEEN 5 AND 480), due_at TIMESTAMPTZ, scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ, deferred_until TIMESTAMPTZ, blocked BOOLEAN NOT NULL DEFAULT FALSE, blocked_reason TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT FALSE, context_url TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'jakeos', source_ref TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, completed_at TIMESTAMPTZ,
  last_touched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), version BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_items_source_ref ON work_items(source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_status_due ON work_items(status, due_at);
CREATE INDEX IF NOT EXISTS idx_work_items_project ON work_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_work_items_schedule ON work_items(scheduled_start) WHERE scheduled_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_deferred ON work_items(deferred_until) WHERE deferred_until IS NOT NULL;
CREATE TABLE IF NOT EXISTS work_item_events (
  id BIGSERIAL PRIMARY KEY, work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE, event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_item_events_item ON work_item_events(work_item_id, created_at DESC);
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, project TEXT DEFAULT '', type TEXT DEFAULT 'session', done BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'jakeos', notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_calendar_starts_at ON calendar_events(starts_at) WHERE starts_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS pipeline (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, org TEXT DEFAULT '', value_usd NUMERIC DEFAULT 0, value TEXT DEFAULT '', stage TEXT DEFAULT 'Prospect',
  type TEXT DEFAULT 'Consulting', deadline TEXT, contact TEXT DEFAULT '', notes TEXT DEFAULT '', last_contact TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS finance_streams (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'Consulting', status TEXT DEFAULT 'Projected', amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD', month TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, amount NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD', monthly BOOLEAN DEFAULT TRUE,
  category TEXT DEFAULT 'Operations', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sms_transactions (
  id TEXT PRIMARY KEY, type TEXT DEFAULT 'transaction', flow TEXT DEFAULT '', amount NUMERIC DEFAULT 0, party TEXT DEFAULT '', provider TEXT DEFAULT '',
  category TEXT DEFAULT 'Other', timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(), raw TEXT DEFAULT '', sender TEXT DEFAULT '', note TEXT DEFAULT '', currency TEXT DEFAULT 'UGX', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, org TEXT DEFAULT '', role TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '', whatsapp TEXT DEFAULT '',
  location TEXT DEFAULT '', type TEXT DEFAULT 'Partner', status TEXT DEFAULT 'Active', notes TEXT DEFAULT '', avatar_emoji TEXT DEFAULT '👤', pipeline_id TEXT,
  last_contact TEXT, next_followup TEXT, tags TEXT DEFAULT '', contract_value NUMERIC DEFAULT 0, contract_currency TEXT DEFAULT 'USD', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS interactions (
  id BIGSERIAL PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE, type TEXT DEFAULT 'note', title TEXT DEFAULT '', content TEXT NOT NULL,
  date TEXT NOT NULL, outcome TEXT DEFAULT '', follow_up_date TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS followups (
  id BIGSERIAL PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE, message TEXT NOT NULL, due_date TEXT NOT NULL,
  channel TEXT DEFAULT 'telegram', sent BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, client_name TEXT NOT NULL, client_org TEXT DEFAULT '', client_email TEXT DEFAULT '', client_address TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb, subtotal NUMERIC DEFAULT 0, tax_rate NUMERIC DEFAULT 0, tax_amount NUMERIC DEFAULT 0, total NUMERIC DEFAULT 0, currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'Draft', issued_date TEXT, due_date TEXT, paid_date TEXT, notes TEXT DEFAULT '', pipeline_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, org TEXT DEFAULT '', source TEXT DEFAULT '', source_url TEXT DEFAULT '', deadline TEXT, budget TEXT DEFAULT '',
  description TEXT DEFAULT '', relevance_score INTEGER DEFAULT 0, relevance_reason TEXT DEFAULT '', status TEXT DEFAULT 'New', tags TEXT DEFAULT '', saved BOOLEAN DEFAULT FALSE,
  seen BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS opportunity_sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, type TEXT DEFAULT 'rss', keywords TEXT DEFAULT '', active BOOLEAN DEFAULT TRUE, last_checked TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, project TEXT DEFAULT '', location TEXT DEFAULT '', date TEXT NOT NULL, duration_hours NUMERIC DEFAULT 1,
  type TEXT DEFAULT 'Training', target_count INTEGER DEFAULT 0, actual_count INTEGER DEFAULT 0, facilitator TEXT DEFAULT 'Jacob Odur', status TEXT DEFAULT 'Planned',
  notes TEXT DEFAULT '', feedback_avg NUMERIC DEFAULT 0, materials TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS research_briefs (
  id TEXT PRIMARY KEY, brief_date DATE NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT DEFAULT '', items JSONB NOT NULL DEFAULT '[]'::jsonb,
  watchlist JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS attention_signals (
  id TEXT PRIMARY KEY, signal_type TEXT NOT NULL DEFAULT 'attention', title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', severity TEXT NOT NULL DEFAULT 'medium',
  source TEXT NOT NULL, source_ref TEXT, action_url TEXT NOT NULL DEFAULT '', starts_at TIMESTAMPTZ, due_at TIMESTAMPTZ, resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attention_signals_open ON attention_signals(resolved, severity, due_at);
CREATE TABLE IF NOT EXISTS momentum_devices (
  id TEXT PRIMARY KEY, user_key TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'android', name TEXT NOT NULL DEFAULT '', fcm_token TEXT NOT NULL UNIQUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_momentum_devices_user ON momentum_devices(user_key,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_client ON interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(due_date, sent);
CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_sms_timestamp ON sms_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
