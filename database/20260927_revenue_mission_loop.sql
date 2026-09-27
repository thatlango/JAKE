-- Revenue Mission integrity + execution bridge
-- Keeps the 30-day sprint authoritative while projecting its actions into canonical JakeOS Work.

-- Repair canonical opportunities created by the original sprint seed.
UPDATE opportunities o
SET
  stage = CASE a.stage
    WHEN 'Target' THEN 'Watching'
    WHEN 'Contacted' THEN 'Qualifying'
    WHEN 'Conversation' THEN 'Pursuing'
    WHEN 'Proposal' THEN 'Drafting'
    WHEN 'Negotiation' THEN 'Decision'
    WHEN 'Contracted' THEN 'Won'
    WHEN 'Invoiced' THEN 'Won'
    WHEN 'Paid' THEN 'Won'
    WHEN 'Lost' THEN 'Lost'
    WHEN 'Parked' THEN 'Closed'
    ELSE COALESCE(o.stage,'Watching')
  END,
  value_amount = a.pipeline_value_usd,
  next_action = a.next_action,
  contact = CASE WHEN COALESCE(a.contact_name,'')<>'' THEN a.contact_name ELSE COALESCE(o.contact,'') END,
  updated_at = NOW()
FROM revenue_sprint_accounts a
WHERE a.opportunity_id=o.id;

CREATE OR REPLACE FUNCTION jakeos_revenue_market_stage(action_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(COALESCE(action_type,''))
    WHEN 'qualification' THEN 'validate'
    WHEN 'proposal' THEN 'bid'
    WHEN 'delivery' THEN 'deliver'
    WHEN 'operations' THEN 'deliver'
    WHEN 'collection' THEN 'collect'
    WHEN 'review' THEN 'decision'
    ELSE 'sell'
  END
$$;

CREATE OR REPLACE FUNCTION jakeos_revenue_outcome_type(action_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(COALESCE(action_type,''))
    WHEN 'delivery' THEN 'delivery'
    WHEN 'operations' THEN 'delivery'
    WHEN 'review' THEN 'decision'
    ELSE 'market'
  END
$$;

-- Project the complete sprint calendar into canonical Work so Momentum can rank and schedule it.
INSERT INTO work_items(
  id,title,description,status,priority,impact,strategic_weight,estimated_minutes,due_at,
  blocked,blocked_reason,pinned,context_url,source,source_ref,tags,metadata,completed_at,created_at,updated_at,last_touched_at
)
SELECT
  'revwork_'||x.id,
  x.title,
  concat_ws(' · ',NULLIF(a.org,''),NULLIF(a.offer,''),NULLIF(x.channel,'')),
  CASE WHEN x.status='done' THEN 'done' ELSE 'ready' END,
  CASE WHEN x.priority IN ('critical','high','medium','low') THEN x.priority ELSE 'high' END,
  5,
  5,
  CASE
    WHEN x.action_type IN ('meeting','review') THEN 60
    WHEN x.action_type IN ('proposal','delivery','operations') THEN 90
    ELSE 30
  END,
  (x.action_date::text||' 17:00:00+03')::timestamptz,
  FALSE,
  '',
  x.priority='critical',
  CASE WHEN a.opportunity_id IS NOT NULL THEN '/opportunities?id='||a.opportunity_id ELSE '/revenue-sprint' END,
  'revenue-sprint',
  x.id,
  '["revenue-sprint","usd10k","commercial"]'::jsonb,
  jsonb_build_object(
    'outcome_type',jakeos_revenue_outcome_type(x.action_type),
    'market_stage',jakeos_revenue_market_stage(x.action_type),
    'completion_definition','Commercial action completed and outcome/result recorded in the Revenue Sprint.',
    'decision_required',x.action_type='review',
    'delegation_preference','me',
    'evidence_required','Recorded result, sent/submitted artifact, meeting outcome, contract, invoice or payment evidence as applicable.',
    'revenue_sprint_id',x.sprint_id,
    'revenue_account_id',x.account_id,
    'revenue_action_type',x.action_type,
    'revenue_channel',x.channel
  ),
  CASE WHEN x.status='done' THEN COALESCE(x.updated_at,NOW()) ELSE NULL END,
  x.created_at,
  NOW(),
  NOW()
FROM revenue_sprint_actions x
LEFT JOIN revenue_sprint_accounts a ON a.id=x.account_id
ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title,
  description=EXCLUDED.description,
  priority=EXCLUDED.priority,
  impact=5,
  strategic_weight=5,
  due_at=EXCLUDED.due_at,
  pinned=EXCLUDED.pinned,
  context_url=EXCLUDED.context_url,
  tags=EXCLUDED.tags,
  metadata=work_items.metadata||EXCLUDED.metadata,
  status=CASE
    WHEN EXCLUDED.status='done' THEN 'done'
    WHEN work_items.status IN ('done','cancelled') THEN 'ready'
    ELSE work_items.status
  END,
  completed_at=CASE
    WHEN EXCLUDED.status='done' THEN COALESCE(work_items.completed_at,NOW())
    ELSE NULL
  END,
  updated_at=NOW(),
  last_touched_at=NOW(),
  version=work_items.version+1;

CREATE OR REPLACE FUNCTION jakeos_revenue_action_to_work_item()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  acct record;
  desc_text text;
  work_status text;
BEGIN
  IF pg_trigger_depth()>1 THEN
    RETURN NEW;
  END IF;

  SELECT org,offer,opportunity_id INTO acct
  FROM revenue_sprint_accounts
  WHERE id=NEW.account_id;

  desc_text:=concat_ws(' · ',NULLIF(acct.org,''),NULLIF(acct.offer,''),NULLIF(NEW.channel,''));
  work_status:=CASE WHEN NEW.status='done' THEN 'done' ELSE 'ready' END;

  INSERT INTO work_items(
    id,title,description,status,priority,impact,strategic_weight,estimated_minutes,due_at,
    blocked,blocked_reason,pinned,context_url,source,source_ref,tags,metadata,completed_at,updated_at,last_touched_at
  ) VALUES (
    'revwork_'||NEW.id,
    NEW.title,
    desc_text,
    work_status,
    CASE WHEN NEW.priority IN ('critical','high','medium','low') THEN NEW.priority ELSE 'high' END,
    5,
    5,
    CASE
      WHEN NEW.action_type IN ('meeting','review') THEN 60
      WHEN NEW.action_type IN ('proposal','delivery','operations') THEN 90
      ELSE 30
    END,
    (NEW.action_date::text||' 17:00:00+03')::timestamptz,
    FALSE,
    '',
    NEW.priority='critical',
    CASE WHEN acct.opportunity_id IS NOT NULL THEN '/opportunities?id='||acct.opportunity_id ELSE '/revenue-sprint' END,
    'revenue-sprint',
    NEW.id,
    '["revenue-sprint","usd10k","commercial"]'::jsonb,
    jsonb_build_object(
      'outcome_type',jakeos_revenue_outcome_type(NEW.action_type),
      'market_stage',jakeos_revenue_market_stage(NEW.action_type),
      'completion_definition','Commercial action completed and outcome/result recorded in the Revenue Sprint.',
      'decision_required',NEW.action_type='review',
      'delegation_preference','me',
      'evidence_required','Recorded result, sent/submitted artifact, meeting outcome, contract, invoice or payment evidence as applicable.',
      'revenue_sprint_id',NEW.sprint_id,
      'revenue_account_id',NEW.account_id,
      'revenue_action_type',NEW.action_type,
      'revenue_channel',NEW.channel
    ),
    CASE WHEN NEW.status='done' THEN NOW() ELSE NULL END,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    title=EXCLUDED.title,
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    due_at=EXCLUDED.due_at,
    pinned=EXCLUDED.pinned,
    context_url=EXCLUDED.context_url,
    tags=EXCLUDED.tags,
    metadata=work_items.metadata||EXCLUDED.metadata,
    status=CASE
      WHEN NEW.status='done' THEN 'done'
      WHEN work_items.status IN ('done','cancelled') THEN 'ready'
      ELSE work_items.status
    END,
    completed_at=CASE
      WHEN NEW.status='done' THEN COALESCE(work_items.completed_at,NOW())
      ELSE NULL
    END,
    updated_at=NOW(),
    last_touched_at=NOW(),
    version=work_items.version+1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revenue_action_to_work_item ON revenue_sprint_actions;
CREATE TRIGGER trg_revenue_action_to_work_item
AFTER INSERT OR UPDATE OF title,action_date,action_type,channel,priority,status,account_id
ON revenue_sprint_actions
FOR EACH ROW EXECUTE FUNCTION jakeos_revenue_action_to_work_item();

CREATE OR REPLACE FUNCTION jakeos_work_item_to_revenue_action()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth()>1 OR NEW.source<>'revenue-sprint' OR NEW.source_ref IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status='done' AND OLD.status IS DISTINCT FROM 'done' THEN
    UPDATE revenue_sprint_actions
      SET status='done',updated_at=NOW()
      WHERE id=NEW.source_ref AND status<>'done';
  ELSIF OLD.status='done' AND NEW.status<>'done' THEN
    UPDATE revenue_sprint_actions
      SET status='todo',updated_at=NOW()
      WHERE id=NEW.source_ref AND status='done';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_item_to_revenue_action ON work_items;
CREATE TRIGGER trg_work_item_to_revenue_action
AFTER UPDATE OF status ON work_items
FOR EACH ROW EXECUTE FUNCTION jakeos_work_item_to_revenue_action();
