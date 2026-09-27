CREATE TABLE IF NOT EXISTS revenue_engine_offers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  buyer_outcome TEXT NOT NULL,
  ideal_buyer TEXT NOT NULL,
  price_min_usd NUMERIC NOT NULL DEFAULT 0,
  price_max_usd NUMERIC NOT NULL DEFAULT 0,
  billing_model TEXT NOT NULL DEFAULT 'fixed',
  cash_speed_days INTEGER NOT NULL DEFAULT 30,
  delivery_days INTEGER NOT NULL DEFAULT 10,
  mobilization_pct NUMERIC NOT NULL DEFAULT 50,
  delivery_model TEXT NOT NULL DEFAULT 'service',
  estate_assets TEXT NOT NULL DEFAULT '',
  proof_points TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_engine_markets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  segment TEXT NOT NULL,
  geography TEXT NOT NULL DEFAULT 'Uganda',
  sales_cycle_min_days INTEGER NOT NULL DEFAULT 7,
  sales_cycle_max_days INTEGER NOT NULL DEFAULT 60,
  deal_min_usd NUMERIC NOT NULL DEFAULT 0,
  deal_max_usd NUMERIC NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium',
  entry_strategy TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_engine_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  speed TEXT NOT NULL DEFAULT 'medium',
  best_for TEXT NOT NULL DEFAULT '',
  operating_rule TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_engine_campaigns (
  id TEXT PRIMARY KEY,
  sprint_id TEXT REFERENCES revenue_sprints(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  engine TEXT NOT NULL,
  offer_id TEXT REFERENCES revenue_engine_offers(id) ON DELETE SET NULL,
  market_id TEXT REFERENCES revenue_engine_markets(id) ON DELETE SET NULL,
  channel_id TEXT REFERENCES revenue_engine_channels(id) ON DELETE SET NULL,
  target_cash_usd NUMERIC NOT NULL DEFAULT 0,
  target_accounts INTEGER NOT NULL DEFAULT 0,
  starts_on DATE,
  ends_on DATE,
  success_metric TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revenue_engine_campaigns_sprint ON revenue_engine_campaigns(sprint_id,status);

CREATE TABLE IF NOT EXISTS revenue_engine_experiments (
  id TEXT PRIMARY KEY,
  sprint_id TEXT REFERENCES revenue_sprints(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES revenue_engine_campaigns(id) ON DELETE SET NULL,
  channel_id TEXT REFERENCES revenue_engine_channels(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  starts_on DATE,
  ends_on DATE,
  success_threshold TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  result TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revenue_engine_experiments_sprint ON revenue_engine_experiments(sprint_id,status);

CREATE TABLE IF NOT EXISTS revenue_engine_proof (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  proof_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  relevance_tags TEXT NOT NULL DEFAULT '',
  source_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO revenue_engine_offers
(id,name,category,buyer_outcome,ideal_buyer,price_min_usd,price_max_usd,billing_model,cash_speed_days,delivery_days,mobilization_pct,delivery_model,estate_assets,proof_points,status)
VALUES
('reo_expert_sprint','Expert Sprint','Expertise','A defined manual, curriculum, strategy, assessment, research or facilitation output delivered quickly.','NGOs, programmes, consulting firms, accelerators',1000,5000,'fixed',7,10,60,'service','Tuku expertise; reusable templates; facilitation systems','Programme design, manuals, BCP, curriculum and facilitation experience.','active'),
('reo_portfolio_diagnostic','MSME Portfolio Diagnostic','Service + technology','Segment a portfolio, identify growth constraints and produce an intervention-ready management view.','Banks, MFIs, NGOs, accelerators, enterprise programmes',2500,7500,'fixed',14,21,60,'hybrid','Tuku BDS; TukuIQ; diagnostics engine','Enterprise diagnostics, BDS delivery, portfolio reporting and advisory workflows.','active'),
('reo_paid_pilot','Paid Institutional Pilot','Pilot','Prove value on 30–100 enterprises, one programme, one district or one operational workflow before scale.','NGOs, banks, public programmes, agribusinesses',2500,10000,'fixed',14,30,60,'hybrid','ImpactOS; Tuku BDS; ECITAA; Units; TukuIQ','Existing programme and field delivery capability plus reusable digital infrastructure.','active'),
('reo_cohort_delivery','Cohort Delivery','Programme delivery','Run an enterprise cohort end-to-end with diagnostics, training, mentoring, monitoring and reporting.','Accelerators, banks, NGOs, foundations',3000,20000,'milestone',21,60,50,'service + platform','Tuku BDS; TukuIQ; Academy patterns','Prior incubation and enterprise-support delivery.','active'),
('reo_ops_digitisation','Organisation Operations Deployment','Implementation','Replace fragmented programme/operations workflows with one operating system and configured processes.','NGOs, consulting organisations, programme implementers',3000,20000,'setup + support',21,30,50,'implementation','ImpactOS; Tuku Auth; TukuIQ','Organisation, programme, MEAL, HR, finance and operations workflows already productised.','active'),
('reo_bds_system','Digital BDS Delivery System','Implementation','Digitise diagnostics, advisor caseloads, interventions and enterprise progress tracking.','Enterprise-support programmes, banks, associations',3000,15000,'setup + licence',21,30,50,'implementation','Tuku BDS; TukuIQ; Units','Existing diagnostic and growth-advisor workflows.','active'),
('reo_managed_service','Managed Programme / Platform Operations','Recurring','Tuku operates the configured workflow, reporting and data discipline for the buyer.','NGOs, enterprise programmes, SMEs',500,3000,'monthly',14,30,50,'managed service','ImpactOS; Tuku BDS; TukuIQ; Units','Operational and reporting capability across programme and business workflows.','active'),
('reo_local_partner','Uganda Implementation Workshare','Partner delivery','Give a prime contractor a ready Uganda/Northern Uganda implementation partner for enterprise, field, training or digital work.','International consulting firms, regional BDS firms, research and implementation primes',3000,30000,'workshare',21,60,40,'subcontract','Tuku delivery team; field network; estate products','Northern Uganda delivery footprint, programme design, facilitation and digital implementation.','active'),
('reo_academy','Managed Digital Academy','Implementation','Launch a branded learning platform with enrolment, progress, assessment and certification.','Training providers, universities, projects, professional bodies',1500,10000,'setup + support',21,30,50,'implementation','SmartVet Academy architecture; Tuku Auth','Existing academy product and learner/admin workflows.','active'),
('reo_intelligence','Opportunity & Market Intelligence','Recurring','Provide decision-ready opportunity, partner and market intelligence instead of raw search results.','Consultancies, NGOs, investors, regional firms',200,2000,'monthly',14,7,100,'managed intelligence','Radar; JakeOS; TukuIQ','Live procurement/opportunity scanning and decision support workflows.','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenue_engine_markets
(id,name,segment,geography,sales_cycle_min_days,sales_cycle_max_days,deal_min_usd,deal_max_usd,priority,entry_strategy,notes,status)
VALUES
('rem_repeat','Previous buyers','Warm / repeat','Uganda',1,21,1000,10000,'critical','Reactivate past buyers with a specific next programme, cohort, manual or pilot offer.','Highest cash velocity because trust and delivery evidence already exist.','active'),
('rem_warm','Warm professional network','Warm network','Uganda / East Africa',3,30,1000,10000,'critical','Use named introductions and specific programme-owner asks rather than generic outreach.','','active'),
('rem_ngo','NGOs and development programmes','Institutional direct','Uganda',14,60,2500,20000,'high','Lead with paid pilot or expert sprint; expand into implementation and managed service.','','active'),
('rem_primes','International primes and regional consultancies','Subcontract / consortium','East Africa',14,60,3000,30000,'high','Sell Uganda implementation workshare, local enterprise delivery and reusable digital infrastructure.','','active'),
('rem_finance','Banks, MFIs and financial-inclusion programmes','Financial institutions','Uganda',21,90,2500,20000,'high','Sell portfolio diagnostics, SME growth cohorts, borrower monitoring and financial-management support.','','active'),
('rem_academia','Universities, academies and training institutions','Education / skills','Uganda / East Africa',14,60,1500,10000,'medium','Sell curriculum, digital academy deployment, enterprise monitoring and facilitation.','','active'),
('rem_agrifood','Agribusinesses, exporters and producer organisations','Agrifood / traceability','Uganda / East Africa',21,90,3000,20000,'high','Sell traceability implementation, field registry, provenance, compliance evidence and monitoring.','','active'),
('rem_small_deals','Local institutional small-deal buyers','Fast institutional purchasing','Uganda',3,21,500,2500,'critical','Use workshops, assessments, manuals and short advisory sprints that can be approved quickly.','','active'),
('rem_tenders','Donor and government procurement','Competitive procurement','Uganda / East Africa',30,180,5000,50000,'strategic','Maintain as upside; do not allow long-cycle bids to crowd out faster cash engines.','','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenue_engine_channels
(id,name,channel_type,speed,best_for,operating_rule,status)
VALUES
('rec_repeat_email','Repeat-buyer direct email','direct','fast','Past buyers and submitted proposals','Reference prior work, make one specific commercial ask and request a decision/scoping date.','active'),
('rec_warm_intro','Warm introduction','referral','fast','Warm network and institutional buyers','Ask for a named programme owner or decision-maker, not a generic company introduction.','active'),
('rec_direct_call','Direct call / WhatsApp','direct','fast','Warm relationships and fast institutional deals','Use after a specific offer exists; end with a dated next step.','active'),
('rec_partner','Prime / consortium outreach','partner','medium','International primes and regional firms','Pitch a defined Uganda workshare, credentials and availability.','active'),
('rec_procurement','Procurement / tender','procurement','slow','Large institutional opportunities','Pursue selectively and score for eligibility, cash timing and workshare before investing.','active'),
('rec_events','Events / ecosystem rooms','network','medium','Banks, accelerators, associations, ecosystem buyers','Pre-book meetings and follow up same day with a fixed offer.','active'),
('rec_referral','Referral partner','referral','medium','Consultants and firms who can distribute Tuku offers','Make referral economics and delivery responsibility explicit.','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenue_engine_campaigns
(id,sprint_id,name,engine,offer_id,market_id,channel_id,target_cash_usd,target_accounts,starts_on,ends_on,success_metric,status,notes)
VALUES
('rc_repeat_3000','rev30_2026_09','Repeat Buyer Reactivation','warm cash','reo_cohort_delivery','rem_repeat','rec_repeat_email',3000,10,'2026-09-27','2026-10-06','At least 5 replies, 3 buyer calls and 1 paid scope / mobilization.','active','4Africa is the lead account; mine all prior buyers and commissioners.'),
('rc_pilot_2500','rev30_2026_09','Paid Pilot Blitz','pilot','reo_paid_pilot','rem_ngo','rec_warm_intro',2500,10,'2026-09-27','2026-10-10','3 scoping calls and at least 1 paid pilot.','active','Lead with 30–100 enterprise / one-programme / one-district proof-of-value.'),
('rc_expert_2000','rev30_2026_09','Expert Sprint Engine','expertise','reo_expert_sprint','rem_small_deals','rec_repeat_email',2000,12,'2026-09-27','2026-10-10','2 fixed-scope sprint sales.','active','Manuals, curricula, programme design, facilitation, diagnostics, research and short advisory outputs.'),
('rc_small_1500','rev30_2026_09','Small Institutional Deal Engine','fast cash','reo_expert_sprint','rem_small_deals','rec_direct_call',1500,15,'2026-09-28','2026-10-12','3 deals at USD 500–1,500 or equivalent.','active','Protect against dependency on large procurement cycles.'),
('rc_software_1000','rev30_2026_09','Software Setup / Licence Wedge','software','reo_ops_digitisation','rem_ngo','rec_warm_intro',1000,8,'2026-09-29','2026-10-20','1 paid setup, licence deposit or pilot conversion.','active','Sell the operational outcome, not the product name.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenue_engine_experiments
(id,sprint_id,campaign_id,channel_id,name,hypothesis,starts_on,ends_on,success_threshold,status,result)
VALUES
('rex_repeat7','rev30_2026_09','rc_repeat_3000','rec_repeat_email','7-day repeat-buyer reactivation','Past buyers will convert faster when approached with a specific Q4 scope rather than a generic check-in.','2026-09-27','2026-10-03','10 contacts → 5 replies → 3 calls → 1 paid scope.','active',''),
('rex_pilot10','rev30_2026_09','rc_pilot_2500','rec_warm_intro','10-account paid-pilot test','A small fixed-price proof-of-value will get more meetings than asking institutions to buy a full platform or programme.','2026-09-27','2026-10-06','10 accounts → 3 calls → 1 paid pilot.','active',''),
('rex_prime5','rev30_2026_09',NULL,'rec_partner','5-prime Uganda workshare test','Regional primes will engage when Tuku is positioned as an execution workshare rather than another bidder.','2026-09-29','2026-10-08','5 primes → 2 responses → 1 active workshare discussion.','active',''),
('rex_managed3','rev30_2026_09',NULL,'rec_warm_intro','Managed-service demand test','Some organisations prefer Tuku to operate reporting/workflows rather than buy software alone.','2026-10-01','2026-10-10','3 qualified buyers → 1 recurring-service conversation.','planned','')
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenue_engine_proof
(id,title,proof_type,summary,relevance_tags,source_note,status)
VALUES
('rep_4africa','4Africa incubation delivery','client outcome','Completed incubation engagement was paid; client feedback stated the work exceeded expectations and indicated future collaboration.','cohort,incubation,repeat-buyer,bds','Mailbox and completed delivery history.','active'),
('rep_prudev','PRUDEV II business-growth systems and training','delivery capability','Business-growth training, manuals, BCP workflows and MSME support across multiple Northern Uganda districts.','manuals,training,bds,msme,northern-uganda','Current professional delivery portfolio; use only within conflict guardrails.','active'),
('rep_radiopreneur','Radiopreneur business training response','programme design','Designed a radio-delivered entrepreneurship/business training response during COVID-era delivery constraints.','curriculum,programme-design,remote-training,innovation','Innovation Village experience.','active'),
('rep_investmentclubs','Business and financial literacy classes','training delivery','Supported design and delivery of business and financial literacy classes for Investment Clubs Uganda.','financial-literacy,training,msme','October 2024–September 2025 engagement.','active'),
('rep_estate','Reusable Tuku digital infrastructure','product capability','Existing estate covers BDS diagnostics, programme operations, BI, financial operations, field traceability, academy, lending and payments foundations.','digital-transformation,bds,meal,traceability,finance,academy','Tuku product estate.','active')
ON CONFLICT (id) DO NOTHING;
