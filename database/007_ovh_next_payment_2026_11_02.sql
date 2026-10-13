-- Backfill the owner-confirmed OVHcloud payment date for existing JakeOS installs.
-- This is a calendar date (Africa/Kampala), not a provider-stated payment hour.
-- JakeOS runs all SQL migration files on startup; only apply this update once
-- and preserve any subsequent edits made in Operations.
UPDATE ops_subscriptions
SET
  next_renewal_at = TIMESTAMPTZ '2026-11-02 00:00:00+03',
  notes = CASE
    WHEN notes = '' OR notes LIKE 'Purchased 29 Aug 2026.%'
    THEN 'Next OVH VPS payment date: 2 Nov 2026 (Africa/Kampala), confirmed by account owner on 13 Oct 2026. Payment amount and automatic renewal status must be verified in OVHcloud Manager; do not infer a repeat cycle.'
    ELSE notes
  END,
  metadata = metadata || '{
    "renewalDateConfirmed": true,
    "renewalDateSource": "owner-confirmed-2026-10-13",
    "paymentDateOnly": "2026-11-02",
    "paymentScheduleVersion": "2026-10-13-owner-confirmed"
  }'::jsonb,
  updated_at = NOW()
WHERE id = 'ovh-vps-production'
  AND (metadata->>'paymentScheduleVersion') IS DISTINCT FROM '2026-10-13-owner-confirmed';
