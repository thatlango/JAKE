CREATE TABLE IF NOT EXISTS funding_applications (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 300),
 funder TEXT NOT NULL DEFAULT '',
 initiative TEXT NOT NULL DEFAULT '',
 opportunity_url TEXT,
 owner TEXT NOT NULL DEFAULT '',
 amount NUMERIC(18,2) CHECK(amount IS NULL OR amount>=0),
 currency VARCHAR(3),
 deadline TIMESTAMPTZ,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('discovered','assessing','draft','internal_review','ready','submitted_unverified','submitted_verified','under_review','shortlisted','awarded','rejected','withdrawn','missed')),
 submitted_at TIMESTAMPTZ,
 submission_channel TEXT,
 submission_reference TEXT,
 receipt_url TEXT,
 next_action TEXT,
 next_action_due TIMESTAMPTZ,
 follow_up_at TIMESTAMPTZ,
 notes TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT verified_requires_evidence CHECK(status <> 'submitted_verified' OR
 (submitted_at IS NOT NULL AND nullif(trim(coalesce(submission_channel,'')),'') IS NOT NULL
 AND (nullif(trim(coalesce(submission_reference,'')),'') IS NOT NULL OR nullif(trim(coalesce(receipt_url,'')),'') IS NOT NULL)))
);
CREATE TABLE IF NOT EXISTS funding_application_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id UUID NOT NULL REFERENCES funding_applications(id) ON DELETE CASCADE,
 old_status TEXT,
 new_status TEXT NOT NULL,
 actor TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS funding_applications_deadline_idx ON funding_applications(deadline);
CREATE INDEX IF NOT EXISTS funding_applications_status_idx ON funding_applications(status);
CREATE INDEX IF NOT EXISTS funding_events_application_idx ON funding_application_events(application_id,recorded_at DESC);