INSERT INTO ops_subscriptions(
  id,name,provider,category,product,plan_name,billing_mode,billing_cycle,amount,currency,
  purchased_at,next_renewal_at,expires_at,auto_renew,status,usage_current,usage_limit,usage_unit,
  usage_period_end,source,source_ref,notes,metadata
) VALUES
(
  'hostinger-business-web-hosting','Hostinger Business Web Hosting','Hostinger','hosting','Tuku estate','Business Web Hosting (1 year)',
  'recurring','annual',47.90,'USD','2026-07-03T08:14:55Z',NULL,'2027-07-03T08:14:55Z',NULL,'active',NULL,50,'GB storage',NULL,
  'gmail','Hostinger invoice H_46219156',
  'Paid 3 Jul 2026 for a one-year Business Web Hosting term with Daily Backup included. Term-end is derived from the one-year purchase; confirm hPanel auto-renew and billing date.',
  '{"invoice":"H_46219156","termMonths":12,"dailyBackupsIncluded":true,"planVersion":"v3","cpuCores":2,"ramGB":3,"storageGB":50,"websiteLimit":50,"nodeWebsiteLimit":5,"databaseLimit":150,"databaseEngine":"MySQL","autoRenewConfirmed":false}'::jsonb
),
(
  'hostinger-starter-business-email','Hostinger Starter Business Email','Hostinger','email','Tuku estate','Starter Business Email (1 year)',
  'recurring','annual',7.08,'USD','2026-07-03T09:54:20Z',NULL,'2027-07-03T09:54:20Z',NULL,'active',NULL,NULL,'',NULL,
  'gmail','Hostinger invoice H_46223310',
  'Paid 3 Jul 2026 for a one-year Starter Business Email term. Term-end is derived from the one-year purchase; confirm hPanel auto-renew and billing date.',
  '{"invoice":"H_46223310","termMonths":12,"autoRenewConfirmed":false}'::jsonb
)
ON CONFLICT(id) DO UPDATE SET
  name=EXCLUDED.name,
  provider=EXCLUDED.provider,
  category=EXCLUDED.category,
  product=EXCLUDED.product,
  plan_name=CASE WHEN ops_subscriptions.source='manual' THEN ops_subscriptions.plan_name ELSE EXCLUDED.plan_name END,
  billing_mode=CASE WHEN ops_subscriptions.source='manual' THEN ops_subscriptions.billing_mode ELSE EXCLUDED.billing_mode END,
  billing_cycle=CASE WHEN ops_subscriptions.source='manual' THEN ops_subscriptions.billing_cycle ELSE EXCLUDED.billing_cycle END,
  amount=COALESCE(ops_subscriptions.amount,EXCLUDED.amount),
  currency=COALESCE(NULLIF(ops_subscriptions.currency,''),EXCLUDED.currency),
  purchased_at=COALESCE(ops_subscriptions.purchased_at,EXCLUDED.purchased_at),
  expires_at=COALESCE(ops_subscriptions.expires_at,EXCLUDED.expires_at),
  usage_limit=COALESCE(ops_subscriptions.usage_limit,EXCLUDED.usage_limit),
  usage_unit=COALESCE(NULLIF(ops_subscriptions.usage_unit,''),EXCLUDED.usage_unit),
  notes=CASE WHEN ops_subscriptions.notes<>'' THEN ops_subscriptions.notes ELSE EXCLUDED.notes END,
  metadata=ops_subscriptions.metadata||EXCLUDED.metadata,
  updated_at=NOW();
