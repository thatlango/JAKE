CREATE TABLE IF NOT EXISTS ops_subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'service',
  product TEXT NOT NULL DEFAULT '',
  plan_name TEXT NOT NULL DEFAULT '',
  billing_mode TEXT NOT NULL DEFAULT 'unknown',
  billing_cycle TEXT NOT NULL DEFAULT 'unknown',
  amount NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  purchased_at TIMESTAMPTZ,
  next_renewal_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  auto_renew BOOLEAN,
  status TEXT NOT NULL DEFAULT 'active',
  usage_current NUMERIC,
  usage_limit NUMERIC,
  usage_unit TEXT NOT NULL DEFAULT '',
  usage_period_end TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ops_subscriptions_due ON ops_subscriptions(next_renewal_at,expires_at);
CREATE INDEX IF NOT EXISTS idx_ops_subscriptions_provider ON ops_subscriptions(provider,status);
