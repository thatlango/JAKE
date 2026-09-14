CREATE TABLE IF NOT EXISTS opportunity_watch_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'Both',
  description TEXT NOT NULL DEFAULT '',
  cadence TEXT NOT NULL DEFAULT 'Daily',
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'JakeOS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'Both';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS opportunity_type TEXT NOT NULL DEFAULT 'Opportunity';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'Discover';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS value_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS arrangement TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS procurement_type TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS fit_score SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS bid_posture TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_context TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS watch_profile_id TEXT REFERENCES opportunity_watch_profiles(id) ON DELETE SET NULL;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS legacy_pipeline_id TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS legacy_grant_id TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT '';
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_opportunity ON proposals(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage_deadline ON opportunities(stage, deadline);
CREATE INDEX IF NOT EXISTS idx_opportunities_watch_profile ON opportunities(watch_profile_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_audience_stage ON opportunities(audience, stage);
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_legacy_pipeline ON opportunities(legacy_pipeline_id) WHERE legacy_pipeline_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_legacy_grant ON opportunities(legacy_grant_id) WHERE legacy_grant_id IS NOT NULL;

INSERT INTO opportunity_watch_profiles (id,name,audience,description,cadence,criteria,active,source)
VALUES
('watch_jacob_q4','Jacob Q4 Role Hunt','Jacob','Paid roles and individual consultancies prioritising remote/Africa-eligible work and strong senior-level fit.','Twice daily','{"themes":["programme management","MSME and enterprise development","innovation ecosystems","livelihoods","partnerships and resource mobilisation","MEL and learning","digital transformation and AI for development","youth employment","market systems","organisational development","facilitation","research","proposal and programme design"],"priority":["remote","Africa-wide","East Africa","Uganda"],"exclude":["internships","volunteer roles","closed roles","roles below seniority"]}'::jsonb,TRUE,'ChatGPT automation'),
('watch_tuku_q4','Tuku Q4 Opportunity Hunt','Tuku-Tuku','Institutional consulting, technical assistance, tender, grant, framework, consortium and implementation opportunities for Tuku-Tuku Innovation Labs.','Twice daily','{"themes":["MSME and BDS","entrepreneurship","youth employment","refugee and host-community livelihoods","incubation and acceleration","digital transformation","AI for development","market systems","private-sector development","agribusiness","resilience","research and MEL","training and ToT","knowledge products","programme management"],"priority":["Uganda","East Africa","Africa-wide","remote global"],"postures":["Bid","Recruit Specialists & Bid","Consortium Bid","Consider"]}'::jsonb,TRUE,'ChatGPT automation')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,audience=EXCLUDED.audience,description=EXCLUDED.description,cadence=EXCLUDED.cadence,criteria=EXCLUDED.criteria,active=EXCLUDED.active,source=EXCLUDED.source,updated_at=NOW();

INSERT INTO opportunities (id,title,org,source,deadline,budget,description,relevance_score,relevance_reason,status,tags,saved,seen,audience,opportunity_type,stage,value_amount,currency,contact,notes,next_action,legacy_pipeline_id,updated_at)
SELECT 'legacy_pipeline_'||p.id,p.name,p.org,'JakeOS legacy pipeline',p.deadline,p.value,p.notes,0,'Migrated from the former JakeOS Pipeline module','Tracked',p.type,TRUE,TRUE,'Tuku-Tuku',
CASE WHEN lower(p.type)='consulting' THEN 'Consultancy' WHEN lower(p.type)='program' THEN 'Programme' ELSE COALESCE(NULLIF(p.type,''),'Opportunity') END,
CASE WHEN p.stage='Prospect' THEN 'Qualifying' WHEN p.stage='Applied' THEN 'Submitted' WHEN p.stage IN ('In Delivery','Active Partner') THEN 'Won' WHEN p.stage='Lost' THEN 'Lost' WHEN p.stage='Closed' THEN 'Closed' ELSE 'Pursuing' END,
COALESCE(p.value_usd,0),'USD',p.contact,p.notes,p.notes,p.id,COALESCE(p.updated_at,NOW())
FROM pipeline p ON CONFLICT (id) DO NOTHING;

INSERT INTO opportunities (id,title,org,source,source_url,deadline,budget,description,relevance_score,relevance_reason,status,tags,saved,seen,audience,opportunity_type,stage,value_amount,currency,contact,notes,source_context,checklist,next_action,legacy_grant_id,updated_at)
SELECT 'legacy_grant_'||g.id,g.title,g.funder,'JakeOS legacy grants',g.website,g.deadline,
CASE WHEN g.amount>0 THEN g.amount::text||' '||g.currency ELSE '' END,g.notes,0,'Migrated from the former Grants & bids module','Tracked',g.sector,TRUE,TRUE,'Tuku-Tuku',COALESCE(NULLIF(g.type,''),'Grant'),
CASE WHEN g.stage='Identified' THEN 'Qualifying' WHEN g.stage='LOI Submitted' THEN 'Submitted' WHEN g.stage='Full Application' THEN 'Drafting' WHEN g.stage='Under Review' THEN 'Decision' WHEN g.stage='Awarded' THEN 'Won' WHEN g.stage='Rejected' THEN 'Lost' WHEN g.stage='Reporting' THEN 'Won' ELSE 'Pursuing' END,
COALESCE(g.amount,0),COALESCE(NULLIF(g.currency,''),'USD'),g.contact,g.notes,g.context,g.checklist,g.notes,g.id,COALESCE(g.updated_at,NOW())
FROM grant_items g ON CONFLICT (id) DO NOTHING;

UPDATE proposals p SET opportunity_id=o.id FROM opportunities o WHERE p.opportunity_id IS NULL AND p.deal_id IS NOT NULL AND o.legacy_pipeline_id=p.deal_id;

INSERT INTO opportunities (id,title,org,source,deadline,description,relevance_score,relevance_reason,status,tags,saved,seen,audience,opportunity_type,stage,fit_score,bid_posture,next_action,watch_profile_id,updated_at)
VALUES
('watch_enabel_uga22003_10452','UGA22003-10452 Lot 2 — Innovation Challenge for Trainers of Trainers in Mini Hubs','Enabel Uganda','ChatGPT active watch','2026-10-02','Priority Tuku-Tuku bid. Team Lead and two Digital Experts need verification; the 17 September information session is part of the pursuit.',95,'Strong enterprise-development and training fit','Watching','training,ToT,innovation hubs',TRUE,TRUE,'Tuku-Tuku','Tender','Pursuing',5,'Recruit Specialists & Bid','Resolve specialist team and complete bid package','watch_tuku_q4',NOW()),
('watch_uk_pact_renewables','Uganda C&I Captive-Renewables Technical Assistance','UK PACT / Palladium','ChatGPT active watch','2026-09-21','High-value technical-assistance opportunity; stronger with recruited energy specialists.',82,'Strategic consulting value with specialist gap','Watching','technical assistance,energy,Uganda',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',4,'Recruit Specialists & Bid','Confirm technical specialists and bid/no-bid','watch_tuku_q4',NOW()),
('watch_unicef_ssa_advocacy','SSA Social Protection Advocacy Rollout','UNICEF','ChatGPT active watch','2026-09-17','Regional advocacy/capacity-building opportunity under active Q4 monitoring.',78,'Capacity building and regional delivery relevance','Watching','social protection,advocacy,SSA',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',4,'Consider','Verify mandatory qualifications and submission route','watch_tuku_q4',NOW()),
('watch_nca_partnerships_eval','Equitable Partnerships Evaluation','Norwegian Church Aid','ChatGPT active watch','2026-09-20','Evaluation opportunity under the institutional Q4 watch.',76,'Evaluation, learning and organisational-development fit','Watching','evaluation,partnerships,MEL',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',4,'Consider','Complete eligibility and evidence check','watch_tuku_q4',NOW()),
('watch_nitau_refugee_coord','Refugee Partnership Coordination & Monitoring System','NITA-U / World Bank','ChatGPT active watch','2026-10-22','Uganda digital-system and coordination opportunity; best through a consortium combining systems and programme capability.',88,'Digital systems plus refugee-programme relevance','Watching','refugees,digital system,monitoring',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',5,'Consortium Bid','Identify consortium structure and specialist gaps','watch_tuku_q4',NOW()),
('watch_nitau_ict_laws','ICT Laws Capacity Building Phase II','NITA-U','ChatGPT active watch','2026-09-16','Capacity-building assignment under active Tuku monitoring.',80,'Training and institutional capacity-building fit','Watching','ICT,capacity building,Uganda',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',4,'Recruit Specialists & Bid','Verify legal/ICT specialist requirements immediately','watch_tuku_q4',NOW()),
('watch_nitau_ewaste','Integrated E-Waste Data & Inventory System','NITA-U','ChatGPT active watch','2026-09-16','Digital system opportunity being monitored for a possible consortium position.',70,'Systems capability relevant but specialist domain gap','Watching','e-waste,data system,Uganda',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',3,'Consortium Bid','Assess consortium partner and technical requirements','watch_tuku_q4',NOW()),
('watch_undp_mabamba','Mabamba Wetland Ecotourism Association Capacity Building','UNDP / BIOFIN','ChatGPT active watch','2026-09-14','Capacity-building opportunity with deadline on 14 September 2026.',82,'Enterprise and association capacity-building fit','Watching','capacity building,ecotourism,Uganda',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',4,'Bid','Immediate deadline check and submit/no-bid decision','watch_tuku_q4',NOW()),
('watch_warchild_q4','Q4 Co-creation / Proposal Opportunity','War Child Canada','ChatGPT active watch','2026-09-22','Q4 co-creation/proposal opportunity being actively monitored for Tuku-Tuku.',84,'Youth/refugee programming and programme-design relevance','Watching','youth,proposal,co-creation',TRUE,TRUE,'Tuku-Tuku','Partnership','Watching',4,'Consider','Clarify scope and prepare co-creation response','watch_tuku_q4',NOW()),
('watch_pmnch_who_comms','Communications, Advocacy and Regional Engagement Consultant','PMNCH / WHO','ChatGPT active watch','2026-09-28','Registered-entity consultancy. Tuku-Tuku is the applicant with Jacob proposed as lead.',86,'Communications, programme and regional engagement fit','Watching','communications,advocacy,regional engagement',TRUE,TRUE,'Tuku-Tuku','Consultancy','Watching',4,'Bid','Complete compliance and application pack','watch_tuku_q4',NOW()),
('watch_gdn_tme_advisor','Technical & M&E Advisor','Global Development Network','ChatGPT active watch','2026-09-30','Strongest as a two-person team combining technical and M&E capability.',84,'Programme design and MEL relevance','Watching','technical advisor,M&E',TRUE,TRUE,'Both','Consultancy','Watching',4,'Recruit Specialists & Bid','Identify complementary M&E/technical partner and qualify','watch_tuku_q4',NOW()),
('watch_developpp_2026','develoPPP 2026','develoPPP','ChatGPT active watch','2026-09-30','Private-sector development programme opportunity under Q4 institutional monitoring.',74,'Potential strategic programme and innovation fit','Watching','private sector development,grant',TRUE,TRUE,'Tuku-Tuku','Grant','Watching',4,'Consider','Check country/entity eligibility and project concept fit','watch_tuku_q4',NOW()),
('watch_eyf_2027','European Youth Foundation 2027 Grants','Council of Europe — European Youth Foundation','ChatGPT active watch','2026-10-01','Youth-programming grant opportunity under Q4 monitoring.',68,'Youth-programming relevance; eligibility must be checked','Watching','youth,grant',TRUE,TRUE,'Tuku-Tuku','Grant','Watching',3,'Consider','Verify geographic and organisation eligibility','watch_tuku_q4',NOW()),
('watch_suyana_social_entrepreneur','Senior Social Entrepreneur & Project Development Lead','Suyana Foundation','ChatGPT active watch','2026-09-22','High-priority role/consultancy lead for Jacob, with potential Tuku-Tuku relevance.',92,'Strong enterprise-development, programme-design and leadership fit','Watching','social enterprise,project development',TRUE,TRUE,'Both','Role','Watching',5,'Apply','Prepare tailored application and verify hard requirements','watch_jacob_q4',NOW()),
('watch_volleyball_pm','Project Manager, Global Programmes','Volleyball Foundation','ChatGPT active watch','2026-09-18','Individual role under active Jacob Q4 monitoring.',80,'Programme-management fit','Watching','project management,global programmes',TRUE,TRUE,'Jacob','Role','Watching',4,'Apply','Verify eligibility and complete tailored application','watch_jacob_q4',NOW()),
('watch_nethope_comms','Communications Consultant','NetHope','ChatGPT active watch','2026-09-18','Individual consultancy under active Jacob Q4 monitoring.',72,'Communications and development-sector experience overlap','Watching','communications,consultancy,remote',TRUE,TRUE,'Jacob','Consultancy','Watching',4,'Apply','Confirm scope and tailor evidence','watch_jacob_q4',NOW()),
('watch_savechildren_ops','Senior Officer, Program Operations','Save the Children','ChatGPT active watch','2026-09-14','Urgent individual role being monitored for Jacob.',78,'Programme operations fit','Watching','program operations,Uganda',TRUE,TRUE,'Jacob','Role','Watching',4,'Apply','Deadline-day eligibility and submission check','watch_jacob_q4',NOW())
ON CONFLICT (id) DO UPDATE SET deadline=EXCLUDED.deadline,description=EXCLUDED.description,relevance_score=EXCLUDED.relevance_score,relevance_reason=EXCLUDED.relevance_reason,audience=EXCLUDED.audience,opportunity_type=EXCLUDED.opportunity_type,fit_score=EXCLUDED.fit_score,bid_posture=EXCLUDED.bid_posture,next_action=EXCLUDED.next_action,watch_profile_id=EXCLUDED.watch_profile_id,updated_at=NOW();
