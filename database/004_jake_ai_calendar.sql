CREATE TABLE IF NOT EXISTS jake_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jake_chat_user_created ON jake_chat_messages(user_key, created_at DESC);

CREATE TABLE IF NOT EXISTS task_calendar_links (
  task_id TEXT PRIMARY KEY REFERENCES work_items(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  google_event_id TEXT NOT NULL UNIQUE,
  etag TEXT,
  last_google_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_calendar_sync_state (
  calendar_id TEXT PRIMARY KEY,
  sync_token TEXT,
  watch_channel_id TEXT,
  watch_resource_id TEXT,
  watch_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
