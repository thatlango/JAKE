
CREATE TABLE IF NOT EXISTS revenue_sprints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  cash_target_usd NUMERIC NOT NULL DEFAULT 10000,
  contracted_target_usd NUMERIC NOT NULL DEFAULT 20000,
  proposal_target_usd NUMERIC NOT NULL DEFAULT 50000,
  pipeline_target_usd NUMERIC NOT NULL DEFAULT 130000,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revenue_sprint_accounts (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES revenue_sprints(id) ON DELETE CASCADE,
  opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
  org TEXT NOT NULL,
  offer TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT 'Cash now',
  relationship TEXT NOT NULL DEFAULT 'Cold',
  stage TEXT NOT NULL DEFAULT 'Target',
  pipeline_value_usd NUMERIC NOT NULL DEFAULT 0,
  cash_30d_target_usd NUMERIC NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_channel TEXT NOT NULL DEFAULT 'Email',
  source_url TEXT NOT NULL DEFAULT '',
  deadline DATE,
  next_action TEXT NOT NULL DEFAULT '',
  next_action_date DATE,
  mobilization_pct NUMERIC NOT NULL DEFAULT 60,
  cash_collected_usd NUMERIC NOT NULL DEFAULT 0,
  contracted_usd NUMERIC NOT NULL DEFAULT 0,
  proposal_sent BOOLEAN NOT NULL DEFAULT FALSE,
  owner TEXT NOT NULL DEFAULT 'Jacob',
  risk TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revenue_sprint_accounts_sprint ON revenue_sprint_accounts(sprint_id,stage,next_action_date);
CREATE INDEX IF NOT EXISTS idx_revenue_sprint_accounts_opportunity ON revenue_sprint_accounts(opportunity_id);

CREATE TABLE IF NOT EXISTS revenue_sprint_actions (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES revenue_sprints(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES revenue_sprint_accounts(id) ON DELETE CASCADE,
  action_date DATE NOT NULL,
  title TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'follow-up',
  channel TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'todo',
  result TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revenue_sprint_actions_due ON revenue_sprint_actions(sprint_id,status,action_date);

INSERT INTO revenue_sprints
(id,name,starts_on,ends_on,cash_target_usd,contracted_target_usd,proposal_target_usd,pipeline_target_usd,status)
VALUES
('rev30_2026_09','30-Day USD 10K Revenue Sprint','2026-09-27','2026-10-26',10000,20000,50000,130000,'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO opportunities (id,title,org,source,source_url,deadline,budget,description,relevance_score,relevance_reason,status,tags,saved,seen)
VALUES
('revopp_4africa','Incubation / accelerator cohort + diagnostics','4Africa','JakeOS Revenue Sprint','',NULL,'USD 5,000','Repeat-buyer expansion: cohort delivery, diagnostics, mentoring and reporting.',95,'Proven buyer and prior successful incubation delivery.','Tracked','revenue-sprint,warm',TRUE,TRUE),
('revopp_swisscontact','EcoProsperity Capacity-Building Programme','Swisscontact Uganda','JakeOS Revenue Sprint','',NULL,'UGX 41,600,000','Existing submitted proposal. Follow up for decision status and clarification needs.',90,'Already submitted; large near-term commercial value.','Tracked','revenue-sprint,proposal',TRUE,TRUE),
('revopp_gopa','Q4 manuals, BDS digitisation and training scopes','GOPA Pro / GIZ PRUDEV II','JakeOS Revenue Sprint','',NULL,'USD 5,000','Only formal external procurement or work outside Jacob current decision influence is eligible.',88,'Repeat commissioning history, subject to conflict guardrail.','Tracked','revenue-sprint,warm,guardrail',TRUE,TRUE),
('revopp_innovationvillage','Northern Uganda enterprise-support delivery','The Innovation Village','JakeOS Revenue Sprint','',NULL,'USD 4,000','Sell Gulu/Lira/West Nile delivery capacity and digital diagnostics.',82,'Warm ecosystem relationship and strong delivery fit.','Tracked','revenue-sprint,warm',TRUE,TRUE),
('revopp_enabel_aedib','AEDIB regional innovation and enterprise-support pilot','Enabel Uganda','JakeOS Revenue Sprint','',NULL,'USD 4,000','Concrete 30-enterprise pilot combining ecosystem delivery and digital tooling.',80,'Existing outreach and strong secondary-city fit.','Tracked','revenue-sprint,partner',TRUE,TRUE),
('revopp_mgtc','Enterprise Development Facilitator','Mbuya Graduate Transition Centre','JakeOS Revenue Sprint','https://mgtc.ac.ug/job-openings/enterprise-development-facilitator/','2026-09-30','USD 2,000','Live facilitator consultancy aligned to enterprise coaching and business advisory.',86,'Strong role-content match and immediate deadline.','Tracked','revenue-sprint,live',TRUE,TRUE),
('revopp_undp','Enterprise training and BDS delivery partnership','UNDP Uganda / eligible lead partner','JakeOS Revenue Sprint','https://www.undp.org/uganda/publications/request-information-csos/ngos/cbos-provision-enterprise-training-and-business-support-services','2026-10-01','USD 8,000 Tuku share','Pursue through an eligible CSO/NGO/CBO lead partner.',84,'Strong curriculum, advisory and monitoring fit; partner eligibility required.','Tracked','revenue-sprint,live,jv',TRUE,TRUE),
('revopp_enabel_venture','Venture sourcing and entrepreneur exchange consortium','Enabel','JakeOS Revenue Sprint','', '2026-10-14','USD 15,000 Tuku share','Consortium route for Uganda venture sourcing, diagnostics and entrepreneur support.',78,'High value but partner-dependent.','Tracked','revenue-sprint,tender,jv',TRUE,TRUE),
('revopp_fcafrica','Green RISE ESO subcontract','FC Africa / Green RISE','JakeOS Revenue Sprint','', '2026-10-08','USD 6,000 Tuku share','Enter through a qualifying national ESO; pitch enterprise diagnostics and delivery systems.',68,'Regional opportunity; partnership dependency lowers probability.','Tracked','revenue-sprint,tender,jv',TRUE,TRUE),
('revopp_tcp','DPO upskilling curriculum consortium','TCP Africa Rwanda','JakeOS Revenue Sprint','', '2026-09-30','USD 5,000 Tuku share','Only pursue with Rwanda-eligible partner; kill quickly if qualification route is weak.',62,'Strong curriculum fit but jurisdiction requirements create friction.','Tracked','revenue-sprint,tender,jv',TRUE,TRUE),
('revopp_aecf','REACT 2.0 technical assistance and BDS','AECF','JakeOS Revenue Sprint','',NULL,'USD 8,000 Tuku share','Diagnostics, dashboards, tools, training materials and SME advisory.',72,'Strong Tuku BDS/TukuIQ fit but competitive procurement.','Tracked','revenue-sprint,tender,jv',TRUE,TRUE),
('revopp_stanbic','Gulu enterprise growth diagnostic pilot','Stanbic Business Incubator','JakeOS Revenue Sprint','',NULL,'USD 4,000','30-50 enterprise diagnostic, targeted coaching and cohort reporting pilot.',78,'Existing regional MSME programming and strong local delivery fit.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_msc','SME portfolio advisory and reporting pilot','Microfinance Support Centre','JakeOS Revenue Sprint','',NULL,'USD 4,000','Enterprise diagnostics plus portfolio advisory and reporting workflow.',74,'Direct BDS mandate and institutional fit.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_ursb','Business Rescue aftercare and SME diagnostics','URSB / IDLO BRAP','JakeOS Revenue Sprint','',NULL,'USD 3,000','Post-training diagnostics and aftercare for Gulu/Lira SMEs.',72,'Regional programme overlap with user delivery footprint.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_wfp','West Nile enterprise portfolio intelligence pilot','WFP / Mastercard Foundation','JakeOS Revenue Sprint','',NULL,'USD 5,000','Diagnostics, advisor workflow and portfolio performance dashboard.',70,'Large enterprise portfolio where digital BDS monitoring can add value.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_ussia','Refugee and host enterprise diagnostics','USSIA','JakeOS Revenue Sprint','',NULL,'USD 3,000','Digital enterprise diagnostic and coaching workflow.',70,'Good programme adjacency and Northern Uganda relevance.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_cesvi','Adjumani / Palabek livelihood enterprise pilot','CESVI Uganda','JakeOS Revenue Sprint','',NULL,'USD 2,500','Enterprise growth and digital follow-up pilot for refugee and host communities.',66,'Good field footprint fit.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_aah','Enterprise growth and financial literacy support','Action Against Hunger Uganda','JakeOS Revenue Sprint','',NULL,'USD 2,500','Targeted growth diagnostics and financial literacy follow-up.',62,'Livelihood programme fit, colder relationship.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_caritas','Adjumani enterprise support pilot','Caritas Gulu Diocese','JakeOS Revenue Sprint','',NULL,'USD 2,500','Refugee/host-community enterprise growth package.',72,'Local relationship route and Northern Uganda credibility.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_dca','Rhino Camp enterprise pilot','DanChurchAid Uganda','JakeOS Revenue Sprint','',NULL,'USD 2,500','Enterprise diagnostics, coaching and cohort monitoring.',60,'Relevant livelihood footprint but cold account.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_worldvision','Growth diagnostics and enterprise monitoring','World Vision Uganda','JakeOS Revenue Sprint','',NULL,'USD 3,000','Enterprise portfolio diagnostic and monitoring support.',60,'Strong thematic fit; requires targeted programme entry point.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_muni','Entrepreneurship curriculum and portfolio monitoring','Muni University','JakeOS Revenue Sprint','',NULL,'USD 3,000','Curriculum, facilitation tools and enterprise monitoring for refugee-hosting communities.',78,'Existing relationship and geographic fit.','Tracked','revenue-sprint,warm',TRUE,TRUE),
('revopp_fsme','Digital MSME diagnostics delivery partnership','FSME Uganda','JakeOS Revenue Sprint','',NULL,'USD 3,000','Digital diagnostics and BDS workflow for existing MSME training programmes.',70,'Strong programme fit and Gulu activity.','Tracked','revenue-sprint,partner',TRUE,TRUE),
('revopp_enterpriseug','Certified BDS provider and digital diagnostic partner','Enterprise Uganda','JakeOS Revenue Sprint','',NULL,'USD 2,500','Provider registration plus first digital diagnostic / facilitation assignment.',64,'Relevant ecosystem platform but first assignment timing uncertain.','Tracked','revenue-sprint,partner',TRUE,TRUE),
('revopp_dfcu','Northern Uganda Women in Business masterclass','dfcu Bank','JakeOS Revenue Sprint','',NULL,'USD 3,000','Regional enterprise masterclass plus coaching and diagnostics.',65,'Clear training/mentorship fit; direct-sale route required.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_era92','Gulu entrepreneurship and digital-business cohort','era92','JakeOS Revenue Sprint','',NULL,'USD 2,500','Enterprise growth workshop, diagnostics and digital follow-up.',68,'Local presence and practical training fit.','Tracked','revenue-sprint,direct',TRUE,TRUE),
('revopp_noble','SIYB digital follow-up and entrepreneur tracking','Noble Youth Foundation','JakeOS Revenue Sprint','',NULL,'USD 2,500','Digitise coaching follow-up and portfolio tracking for Lango enterprise cohorts.',68,'Geographic and entrepreneurship overlap.','Tracked','revenue-sprint,partner',TRUE,TRUE),
('revopp_growthafrica','Uganda delivery subcontract','GrowthAfrica','JakeOS Revenue Sprint','',NULL,'USD 5,000','Northern Uganda delivery and technology layer for regional programmes.',66,'Existing JV outreach and strong subcontract logic.','Tracked','revenue-sprint,jv',TRUE,TRUE),
('revopp_ek','East Africa BDS delivery JV','E&K Consulting','JakeOS Revenue Sprint','',NULL,'USD 5,000','Uganda field execution and enterprise-support systems for regional bids.',60,'Existing JV outreach but no active award yet.','Tracked','revenue-sprint,jv',TRUE,TRUE),
('revopp_ega','On-call enterprise development expert','Enterprise Group Africa','JakeOS Revenue Sprint','',NULL,'USD 3,000','Convert consultant-roster application into a Q4 subcontract conversation.',62,'Already contacted; needs commercial follow-up.','Tracked','revenue-sprint,roster',TRUE,TRUE),
('revopp_tradesmart','Regional BDS expert subcontract','TradeSmart Consult','JakeOS Revenue Sprint','',NULL,'USD 3,000','Offer Uganda delivery and enterprise-development specialist capacity.',62,'Already contacted for BDS expert opportunity.','Tracked','revenue-sprint,roster',TRUE,TRUE),
('revopp_progress','Market systems and enterprise-development subcontract','Progress Inc.','JakeOS Revenue Sprint','',NULL,'USD 3,000','Convert global consultant roster into a specific Q4 availability pitch.',55,'Existing application but likely slower conversion.','Tracked','revenue-sprint,roster',TRUE,TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenue_sprint_accounts
(id,sprint_id,opportunity_id,org,offer,lane,relationship,stage,pipeline_value_usd,cash_30d_target_usd,probability,contact_name,contact_email,contact_channel,source_url,deadline,next_action,next_action_date,mobilization_pct,proposal_sent,risk,notes)
VALUES
('rsa_4africa','rev30_2026_09','revopp_4africa','4Africa','Incubation / accelerator cohort + diagnostics','Cash now','Repeat buyer','Target',5000,3000,75,'Patience Ankunda','patience@4africa.com','Email','',NULL,'Ask what Q4 cohorts or enterprise programmes they are commissioning and offer a ready-to-run 8-week cohort.','2026-09-28',60,FALSE,'Do not over-customise before buyer confirms scope.','Prior incubation engagement was completed and paid.'),
('rsa_swisscontact','rev30_2026_09','revopp_swisscontact','Swisscontact Uganda','EcoProsperity Capacity-Building Programme','Cash now','Submitted proposal','Proposal',11300,6000,35,'Swisscontact Uganda','ug_info@swisscontact.org','Email','',NULL,'Follow up on procurement status, decision timeline and clarification needs.','2026-09-28',50,TRUE,'Payment timing may exceed sprint even if awarded.','Existing offer: UGX 41.6M before applicable VAT.'),
('rsa_gopa','rev30_2026_09','revopp_gopa','GOPA Pro / GIZ PRUDEV II','Q4 manuals, BDS digitisation and training scopes','Cash now','Repeat commissioner','Target',5000,2500,60,'Richard Obuku','Richard.Obuku@gopa.eu','Email','',NULL,'Ask about formally procured Q4 scopes where Jacob has no decision influence.','2026-09-28',50,FALSE,'Conflict guardrail: only formal external procurement or clearly non-conflicted work.','Repeat history across manuals, training, BCP and digital capacity.'),
('rsa_innovationvillage','rev30_2026_09','revopp_innovationvillage','The Innovation Village','Northern Uganda enterprise-support delivery','Cash now','Warm network','Target',4000,2400,55,'','','WhatsApp','',NULL,'Pitch Gulu/Lira/West Nile delivery capacity around one active cohort or partner programme.','2026-09-28',60,FALSE,'Needs a specific programme owner, not generic outreach.',''),
('rsa_enabel_aedib','rev30_2026_09','revopp_enabel_aedib','Enabel Uganda','AEDIB regional innovation and enterprise-support pilot','Cash now','Existing outreach','Contacted',4000,2400,40,'Daniel Muhanguzi','daniel.muhanguzi@enabel.be','Email','',NULL,'Reopen with a concrete 30-enterprise pilot and request a 30-minute scoping conversation.','2026-09-28',60,FALSE,'May route through programme procurement rather than direct award.',''),
('rsa_mgtc','rev30_2026_09','revopp_mgtc','Mbuya Graduate Transition Centre','Enterprise Development Facilitator','Tender upside','Live opportunity','Target',2000,1200,45,'','','Email','https://mgtc.ac.ug/job-openings/enterprise-development-facilitator/','2026-09-30','Submit a tailored application immediately.','2026-09-29',60,FALSE,'Deadline is immediate.',''),
('rsa_undp','rev30_2026_09','revopp_undp','UNDP Uganda / eligible lead partner','Enterprise training and BDS delivery partnership','Tender upside','Partner required','Target',8000,4000,25,'','','Email','https://www.undp.org/uganda/publications/request-information-csos/ngos/cbos-provision-enterprise-training-and-business-support-services','2026-10-01','Secure an eligible lead partner and define the Tuku workshare.','2026-09-28',50,FALSE,'Tuku-Tuku may not qualify as lead applicant.',''),
('rsa_enabel_venture','rev30_2026_09','revopp_enabel_venture','Enabel','Venture sourcing and entrepreneur exchange consortium','Tender upside','Consortium','Target',15000,6000,20,'','','Email','', '2026-10-14','Identify consortium lead and pitch Uganda venture sourcing / diagnostics workshare.','2026-09-30',40,FALSE,'Partner-dependent competitive tender.',''),
('rsa_fcafrica','rev30_2026_09','revopp_fcafrica','FC Africa / Green RISE','Green RISE ESO subcontract','Tender upside','Consortium','Target',6000,3000,20,'','','Email','', '2026-10-08','Join information session and secure a qualifying ESO partner.','2026-10-02',50,FALSE,'Geography and qualification route need confirmation.',''),
('rsa_tcp','rev30_2026_09','revopp_tcp','TCP Africa Rwanda','DPO upskilling curriculum consortium','Tender upside','Consortium','Target',5000,2000,15,'','','Email','', '2026-09-30','Find Rwanda-eligible partner by noon; no-bid if none.','2026-09-29',40,FALSE,'Very short deadline and registration requirements.',''),
('rsa_aecf','rev30_2026_09','revopp_aecf','AECF','REACT 2.0 technical assistance and BDS','Tender upside','Cold/JV','Target',8000,4000,20,'','','Email','',NULL,'Identify prime bidders and offer diagnostics/dashboard/advisory workshare.','2026-10-01',50,FALSE,'Competitive procurement and partner dependency.',''),
('rsa_stanbic','rev30_2026_09','revopp_stanbic','Stanbic Business Incubator','Gulu enterprise growth diagnostic pilot','Cash now','Regional fit','Target',4000,2400,45,'','','Email','',NULL,'Request a meeting with the Gulu/incubator team around a 30-50 enterprise pilot.','2026-09-29',60,FALSE,'Must sell enhancement, not platform replacement.',''),
('rsa_msc','rev30_2026_09','revopp_msc','Microfinance Support Centre','SME portfolio advisory and reporting pilot','Cash now','Institutional fit','Target',4000,2400,40,'','','Email','',NULL,'Pitch a 30-enterprise diagnostic and advisory pilot with portfolio report.','2026-09-29',60,FALSE,'Procurement may lengthen cycle.',''),
('rsa_ursb','rev30_2026_09','revopp_ursb','URSB / IDLO BRAP','Business Rescue aftercare and SME diagnostics','Cash now','Programme adjacency','Target',3000,1800,35,'','','Email','',NULL,'Offer Gulu/Lira post-training diagnostics and aftercare package.','2026-09-29',60,FALSE,'Need correct BRAP programme contact.',''),
('rsa_wfp','rev30_2026_09','revopp_wfp','WFP / Mastercard Foundation','West Nile enterprise portfolio intelligence pilot','Cash now','Strategic target','Target',5000,3000,30,'','','Email','',NULL,'Pitch portfolio diagnostics, advisor workflow and management dashboard.','2026-09-30',60,FALSE,'Large institution; direct award may be slow.',''),
('rsa_ussia','rev30_2026_09','revopp_ussia','USSIA','Refugee and host enterprise diagnostics','Cash now','Programme fit','Target',3000,1800,40,'','','Email','',NULL,'Offer a fixed-price digital diagnostic and coaching workflow pilot.','2026-09-30',60,FALSE,'Need decision-maker contact.',''),
('rsa_cesvi','rev30_2026_09','revopp_cesvi','CESVI Uganda','Adjumani / Palabek livelihood enterprise pilot','Cash now','Field fit','Target',2500,1500,35,'','','Email','',NULL,'Send one-page pilot to livelihoods/programme lead.','2026-10-01',60,FALSE,'Cold account.',''),
('rsa_aah','rev30_2026_09','revopp_aah','Action Against Hunger Uganda','Enterprise growth and financial literacy support','Cash now','Field fit','Target',2500,1500,30,'','','Email','',NULL,'Target livelihoods programme lead with enterprise growth package.','2026-10-01',60,FALSE,'Cold account.',''),
('rsa_caritas','rev30_2026_09','revopp_caritas','Caritas Gulu Diocese','Adjumani enterprise support pilot','Cash now','Local route','Target',2500,1500,40,'','','WhatsApp','',NULL,'Use local introduction route and offer a 20-enterprise pilot.','2026-09-30',60,FALSE,'Confirm programme budget authority.',''),
('rsa_dca','rev30_2026_09','revopp_dca','DanChurchAid Uganda','Rhino Camp enterprise pilot','Cash now','Programme fit','Target',2500,1500,30,'','','Email','',NULL,'Pitch enterprise diagnostics and cohort monitoring.','2026-10-01',60,FALSE,'Cold account.',''),
('rsa_worldvision','rev30_2026_09','revopp_worldvision','World Vision Uganda','Growth diagnostics and enterprise monitoring','Cash now','Strategic target','Target',3000,1800,30,'','','Email','',NULL,'Find current livelihoods/enterprise programme owner and pitch pilot.','2026-10-01',60,FALSE,'Large procurement cycle risk.',''),
('rsa_muni','rev30_2026_09','revopp_muni','Muni University','Entrepreneurship curriculum and portfolio monitoring','Cash now','Warm relationship','Target',3000,1800,50,'','','Email','',NULL,'Ask for a scoping meeting around active RETI/enterprise programming.','2026-09-29',60,FALSE,'Budget ownership must be confirmed.',''),
('rsa_fsme','rev30_2026_09','revopp_fsme','FSME Uganda','Digital MSME diagnostics delivery partnership','Cash now','Programme adjacency','Target',3000,1800,40,'','','Email','',NULL,'Pitch digital diagnostics as an add-on to current MSME training.','2026-09-30',60,FALSE,'Need named buyer.',''),
('rsa_enterpriseug','rev30_2026_09','revopp_enterpriseug','Enterprise Uganda','Certified BDS provider and digital diagnostic partner','Cash now','Ecosystem','Target',2500,1500,35,'','','Email','',NULL,'Register/verify provider status and ask for first assignment route.','2026-10-02',60,FALSE,'Provider onboarding may outlast sprint.',''),
('rsa_dfcu','rev30_2026_09','revopp_dfcu','dfcu Bank','Northern Uganda Women in Business masterclass','Cash now','Direct target','Target',3000,1800,35,'','','Email','',NULL,'Pitch one regional masterclass plus 30-day coaching follow-up.','2026-10-02',60,FALSE,'Bank procurement may require vendor onboarding.',''),
('rsa_era92','rev30_2026_09','revopp_era92','era92','Gulu entrepreneurship and digital-business cohort','Cash now','Local fit','Target',2500,1500,40,'','','WhatsApp','',NULL,'Ask Gulu team about October cohorts and offer a fixed-price module.','2026-09-30',60,FALSE,'Keep scope small and fast.',''),
('rsa_noble','rev30_2026_09','revopp_noble','Noble Youth Foundation','SIYB digital follow-up and entrepreneur tracking','Cash now','Local fit','Target',2500,1500,40,'','','WhatsApp','',NULL,'Pitch digitised follow-up for Lango SIYB participants.','2026-09-30',60,FALSE,'Confirm funding window.',''),
('rsa_growthafrica','rev30_2026_09','revopp_growthafrica','GrowthAfrica','Uganda delivery subcontract','Cash now','Existing JV outreach','Contacted',5000,3000,35,'Martin','mku@growthafrica.com','Email','',NULL,'Follow up with a specific Uganda delivery menu and October availability.','2026-09-29',60,FALSE,'May depend on future prime contract.',''),
('rsa_ek','rev30_2026_09','revopp_ek','E&K Consulting','East Africa BDS delivery JV','Cash now','Existing JV outreach','Contacted',5000,3000,30,'','jrono@e-kconsulting.co.ke','Email','',NULL,'Convert the earlier JV outreach into a standing Uganda delivery offer.','2026-09-29',60,FALSE,'No active award confirmed.',''),
('rsa_ega','rev30_2026_09','revopp_ega','Enterprise Group Africa','On-call enterprise development expert','Cash now','Roster application','Contacted',3000,1800,35,'','hr@egahub.org','Email','',NULL,'Send Q4 availability with three packaged assignments they can subcontract.','2026-09-29',60,FALSE,'Roster conversion timing uncertain.',''),
('rsa_tradesmart','rev30_2026_09','revopp_tradesmart','TradeSmart Consult','Regional BDS expert subcontract','Cash now','Prior application','Contacted',3000,1800,35,'','info@tradesmartconsult.co.ke','Email','',NULL,'Follow up with Uganda field-delivery and diagnostic capability.','2026-09-29',60,FALSE,'May be tied to specific bid timing.',''),
('rsa_progress','rev30_2026_09','revopp_progress','Progress Inc.','Market systems and enterprise-development subcontract','Cash now','Roster application','Contacted',3000,1800,30,'','jobs@progressinccompany.com','Email','',NULL,'Send a Q4 availability note tied to concrete enterprise-development deliverables.','2026-09-30',60,FALSE,'Likely slower conversion.','')
ON CONFLICT (id) DO NOTHING;

INSERT INTO revenue_sprint_actions
(id,sprint_id,account_id,action_date,title,action_type,channel,priority,status)
VALUES
('revday01','rev30_2026_09',NULL,'2026-09-27','Lock the three commercial packages, proof points, rate cards and 50-70% mobilization rule.','sprint','JakeOS','critical','todo'),
('revday02','rev30_2026_09',NULL,'2026-09-28','Warm-account blitz: 4Africa, Swisscontact, GOPA, Innovation Village and Enabel. Minimum five direct asks.','outreach','Mixed','critical','todo'),
('revday03','rev30_2026_09',NULL,'2026-09-29','Deadline sprint plus direct sales: MGTC/TCP decisions, Stanbic, MSC, Muni and five consultant/JV follow-ups.','outreach','Mixed','critical','todo'),
('revday04','rev30_2026_09',NULL,'2026-09-30','Close urgent submissions. Contact WFP, USSIA, Caritas, era92, Noble Youth and FSME.','outreach','Mixed','high','todo'),
('revday05','rev30_2026_09',NULL,'2026-10-01','UNDP partner/submission deadline. Send at least ten tailored institutional approaches and book three calls.','outreach','Mixed','critical','todo'),
('revday06','rev30_2026_09',NULL,'2026-10-02','Attend/cover Green RISE information route, clear stale leads, and get every live account to a named next action.','qualification','Mixed','high','todo'),
('revday07','rev30_2026_09',NULL,'2026-10-03','Week-one review: 30 accounts touched, 10 replies, 5 calls booked, 3 proposals active. Kill weak pursuits.','review','JakeOS','critical','todo'),
('revday08','rev30_2026_09',NULL,'2026-10-04','Prepare meetings and two reusable proposal shells. Follow up every warm account without a reply.','proposal','Mixed','high','todo'),
('revday09','rev30_2026_09',NULL,'2026-10-05','Run buyer conversations. Convert needs into fixed outcomes, price, timeline and mobilization terms.','meeting','Calls','critical','todo'),
('revday10','rev30_2026_09',NULL,'2026-10-06','SME conference attack plan: arrive with pre-booked meetings, five direct asks and same-day follow-ups.','meeting','In-person','critical','todo'),
('revday11','rev30_2026_09',NULL,'2026-10-07','Send proposals within 24 hours of qualified conversations. Target cumulative USD 25K quoted.','proposal','Email','critical','todo'),
('revday12','rev30_2026_09',NULL,'2026-10-08','Green RISE deadline/partner decision. Advance or kill. Chase all proposals older than 48 hours.','close','Mixed','high','todo'),
('revday13','rev30_2026_09',NULL,'2026-10-09','Negotiation day: ask for decision dates, procurement steps and mobilization mechanics.','close','Calls','critical','todo'),
('revday14','rev30_2026_09',NULL,'2026-10-10','Mid-sprint funnel review: minimum 15 conversations, 6 proposals, USD 50K proposed pipeline.','review','JakeOS','critical','todo'),
('revday15','rev30_2026_09',NULL,'2026-10-11','Focus only on top ten close-next accounts. Remove distractions and non-buyer work.','close','Mixed','high','todo'),
('revday16','rev30_2026_09',NULL,'2026-10-12','Ask every active proposal: what prevents approval this week? Resolve one blocker per deal.','close','Calls','critical','todo'),
('revday17','rev30_2026_09',NULL,'2026-10-13','Create delivery start plans and invoices in advance for deals likely to sign.','operations','JakeOS','high','todo'),
('revday18','rev30_2026_09',NULL,'2026-10-14','Enabel consortium deadline. Submit/partner or close the pursuit. Push two direct-sale deals to signature.','close','Mixed','critical','todo'),
('revday19','rev30_2026_09',NULL,'2026-10-15','Contracting day: target USD 10K+ signed cumulative value; request mobilization immediately.','close','Mixed','critical','todo'),
('revday20','rev30_2026_09',NULL,'2026-10-16','Invoice every signed deal same day. Confirm receipt and exact payment processing date.','collection','Email','critical','todo'),
('revday21','rev30_2026_09',NULL,'2026-10-17','Week-three review: target USD 20K contracted and USD 5K cash collected. Escalate payment blockers.','review','JakeOS','critical','todo'),
('revday22','rev30_2026_09',NULL,'2026-10-18','Deliver first high-value outputs fast so remaining milestones can be invoiced early.','delivery','JakeOS','high','todo'),
('revday23','rev30_2026_09',NULL,'2026-10-19','Collections sweep: call finance/procurement contacts on every unpaid invoice.','collection','Calls','critical','todo'),
('revday24','rev30_2026_09',NULL,'2026-10-20','Close one additional small fast-turn assignment if cash gap remains above USD 3K.','close','Mixed','critical','todo'),
('revday25','rev30_2026_09',NULL,'2026-10-21','Ship contracted deliverables, secure acceptance evidence and trigger next payment milestones.','delivery','Mixed','high','todo'),
('revday26','rev30_2026_09',NULL,'2026-10-22','Collections sweep plus executive gap review. Every remaining dollar needs a named source and date.','collection','Calls','critical','todo'),
('revday27','rev30_2026_09',NULL,'2026-10-23','Use a fast workshop/manual sprint offer to close any residual cash gap.','close','Mixed','critical','todo'),
('revday28','rev30_2026_09',NULL,'2026-10-24','Weekend delivery/acceptance push only for work tied directly to receivable cash.','delivery','JakeOS','high','todo'),
('revday29','rev30_2026_09',NULL,'2026-10-25','Final collection escalation: confirm transfers, receipts and payment evidence.','collection','Calls','critical','todo'),
('revday30','rev30_2026_09',NULL,'2026-10-26','Sprint close: reconcile cash collected, signed backlog, lessons and next 30-day commercial cycle.','review','JakeOS','critical','todo')
ON CONFLICT (id) DO NOTHING;
