ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS fit_status TEXT NOT NULL DEFAULT 'Needs assessment';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'Needs verification';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessment_status TEXT NOT NULL DEFAULT 'Partial';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessment_confidence TEXT NOT NULL DEFAULT 'Medium';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS opportunity_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS fit_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS decision_rationale TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS winning_strategy TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS mandatory_requirements JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS desirable_requirements JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS strongest_matches JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS gaps JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS hard_blockers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS deliverables JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS application_requirements JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS strategic_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS start_window TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS duration TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS compensation TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_verified_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assessed_at TIMESTAMPTZ;

UPDATE opportunities
SET fit_status=CASE
  WHEN fit_score>=5 THEN 'Strong fit'
  WHEN fit_score=4 THEN 'Good fit'
  WHEN fit_score=3 THEN 'Conditional fit'
  WHEN fit_score BETWEEN 1 AND 2 THEN 'Weak fit'
  WHEN relevance_score>=85 THEN 'Good fit'
  WHEN relevance_score>=70 THEN 'Conditional fit'
  ELSE 'Needs assessment'
END
WHERE fit_status='Needs assessment';

UPDATE opportunities
SET opportunity_summary=COALESCE(NULLIF(description,''),NULLIF(notes,''),''),
    fit_summary=COALESCE(NULLIF(relevance_reason,''),''),
    decision_rationale=CASE
      WHEN bid_posture<>'' THEN 'Current posture: '||bid_posture||'. '||COALESCE(NULLIF(next_action,''),'')
      ELSE COALESCE(NULLIF(next_action,''),'')
    END,
    assessment_status=CASE
      WHEN fit_score>0 AND (relevance_reason<>'' OR description<>'') THEN 'Partial'
      ELSE 'Unassessed'
    END,
    assessed_at=COALESCE(assessed_at,updated_at)
WHERE opportunity_summary='' OR fit_summary='' OR decision_rationale='' OR assessment_status='Partial';

CREATE INDEX IF NOT EXISTS idx_opportunities_fit_status ON opportunities(fit_status, eligibility_status, assessment_status);
