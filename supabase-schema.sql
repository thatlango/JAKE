-- ── JAKE Database Schema for Supabase (PostgreSQL) ──
-- Run this entire file in: Supabase Dashboard → SQL Editor → New query → Run
-- Takes ~10 seconds. Run once on a fresh project.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────
-- Core JAKE tables
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📁',
  description TEXT DEFAULT '',
  tech TEXT DEFAULT '',
  status TEXT DEFAULT 'Planning',
  priority TEXT DEFAULT 'Medium',
  color TEXT DEFAULT '#5C6680',
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  project TEXT DEFAULT '',
  type TEXT DEFAULT 'session',
  done BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'jake',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  org TEXT DEFAULT '',
  value_usd NUMERIC DEFAULT 0,
  value_display TEXT DEFAULT '',
  stage TEXT DEFAULT 'Prospect',
  type TEXT DEFAULT 'Consulting',
  deadline TEXT,
  contact TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  last_contact TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_streams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'Consulting',
  status TEXT DEFAULT 'Projected',
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  month TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  monthly BOOLEAN DEFAULT TRUE,
  category TEXT DEFAULT 'Operations',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_transactions (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT 'transaction',
  flow TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0,
  party TEXT DEFAULT '',
  provider TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw TEXT DEFAULT '',
  sender TEXT DEFAULT '',
  note TEXT DEFAULT '',
  currency TEXT DEFAULT 'UGX',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- CRM
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  org TEXT DEFAULT '',
  role TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  location TEXT DEFAULT '',
  type TEXT DEFAULT 'Partner',
  status TEXT DEFAULT 'Active',
  notes TEXT DEFAULT '',
  avatar_emoji TEXT DEFAULT '👤',
  pipeline_id TEXT,
  last_contact TEXT,
  next_followup TEXT,
  tags TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS interactions (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'note',
  title TEXT DEFAULT '',
  content TEXT NOT NULL,
  date TEXT NOT NULL,
  outcome TEXT DEFAULT '',
  follow_up_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS followups (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  due_date TEXT NOT NULL,
  channel TEXT DEFAULT 'telegram',
  sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- Invoices
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  client_org TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  client_address TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'Draft',
  issued_date TEXT,
  due_date TEXT,
  paid_date TEXT,
  notes TEXT DEFAULT '',
  pipeline_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- Opportunity Radar
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  org TEXT DEFAULT '',
  source TEXT DEFAULT '',
  source_url TEXT DEFAULT '',
  deadline TEXT,
  budget TEXT DEFAULT '',
  description TEXT DEFAULT '',
  relevance_score INTEGER DEFAULT 0,
  relevance_reason TEXT DEFAULT '',
  status TEXT DEFAULT 'New',
  tags TEXT DEFAULT '',
  saved BOOLEAN DEFAULT FALSE,
  seen BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opportunity_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'rss',
  keywords TEXT DEFAULT '',
  active BOOLEAN DEFAULT TRUE,
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- Workshops
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project TEXT DEFAULT '',
  location TEXT DEFAULT '',
  date TEXT NOT NULL,
  duration_hours NUMERIC DEFAULT 1,
  type TEXT DEFAULT 'Training',
  target_count INTEGER DEFAULT 0,
  actual_count INTEGER DEFAULT 0,
  facilitator TEXT DEFAULT 'Jacob Odur',
  status TEXT DEFAULT 'Planned',
  notes TEXT DEFAULT '',
  feedback_avg NUMERIC DEFAULT 0,
  materials TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- Settings
-- ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_interactions_client ON interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(due_date, sent);
CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
CREATE INDEX IF NOT EXISTS idx_sms_timestamp ON sms_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ────────────────────────────────────────
-- Row Level Security — disable for service key access
-- (Service role key bypasses RLS, which is what JAKE uses server-side)
-- ────────────────────────────────────────

ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline         ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_streams  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE followups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities    ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshops        ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings         ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────
-- Seed default data
-- ────────────────────────────────────────

INSERT INTO clients (id, name, org, role, type, status, notes, avatar_emoji)
VALUES
  ('c_palladium',   'Palladium Team',        'Palladium',       'Programme Officer', 'Partner',  'Active', 'Active implementing partner. Multiple engagements across Northern Uganda.', '🏢'),
  ('c_gopa',        'GOPA AFC Team',          'GOPA AFC',        'Programme Manager', 'Partner',  'Active', 'Agricultural and rural capacity building partner.', '🌾'),
  ('c_lead4africa', 'Lead4Africa Programme',  'Lead4Africa',     'Programme Lead',    'Client',   'Active', '4Africa Innovation Incubator. 12-week program March–June 2026.', '🌱'),
  ('c_2xglobal',    '2X Global Partnerships', '2X Global',       'Partnerships Team', 'Prospect', 'Active', 'Gender-smart business tools. $24,000. Applied. Due July 2026.', '♀️'),
  ('c_muni',        'Muni University',        'Muni University', 'Research Office',   'Partner',  'Active', 'Academic partnership for MSME research. MOU in discussion.', '🎓'),
  ('c_gulu_uni',    'Gulu University',        'Gulu University', 'Business School',   'Prospect', 'Active', 'Potential co-delivery of MSME training and research.', '🎓')
ON CONFLICT (id) DO NOTHING;

INSERT INTO opportunity_sources (id, name, url, type, keywords, active)
VALUES
  ('src_1', 'ReliefWeb Uganda',    'https://reliefweb.int/jobs/rss.xml?source=reliefweb&country=Uganda', 'rss', 'consultant,MSME,training,capacity,agriculture', TRUE),
  ('src_2', 'UN Jobs Uganda',      'https://unjobs.org/duty_stations/uganda.rss', 'rss', 'consultant,training,agriculture', TRUE),
  ('src_3', 'USAID Opportunities', 'https://www.usaid.gov/rss/news', 'rss', 'Uganda,MSME,agriculture,consultant', TRUE),
  ('src_4', 'GIZ Africa',          'https://www.giz.de/en/jobs/rss.xml', 'rss', 'Uganda,East Africa,consultant', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO finance_streams (id, name, type, status, amount, currency, month)
VALUES
  ('f1', '4Africa Innovation Incubator',   'Consulting', 'Confirmed',  12000, 'USD', 'Mar–Jun 2026'),
  ('f2', 'FEMINATURE FMS Framework',       'Systems',    'Confirmed',   3500, 'USD', 'Mar–Apr 2026'),
  ('f3', 'MSME Workshop — Gulu',           'Training',   'Confirmed',   1800, 'USD', 'Apr 2026'),
  ('f4', '2X Global Gender-Smart Tools',   'Consulting', 'Pending',    24000, 'USD', 'Jun–Jul 2026'),
  ('f5', 'MSME Workshop — Lira',           'Training',   'Projected',   1800, 'USD', 'May 2026')
ON CONFLICT (id) DO NOTHING;

INSERT INTO expenses (id, name, amount, currency, monthly, category)
VALUES
  ('e1', 'Gulu Office / Co-working',          200, 'USD', TRUE,  'Operations'),
  ('e2', 'Travel Gulu–Lira',                  150, 'USD', TRUE,  'Travel'),
  ('e3', 'Software & Subscriptions',           90, 'USD', TRUE,  'Tools'),
  ('e4', 'Workshop Materials & Printing',     300, 'USD', FALSE, 'Programs'),
  ('e5', 'Airtime & Data',                     40, 'USD', TRUE,  'Utilities')
ON CONFLICT (id) DO NOTHING;

-- Done! Your JAKE database is ready.
SELECT 'JAKE database initialised successfully! 🚀' as status;
