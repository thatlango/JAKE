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


-- Baseline deep assessments for the watchlist already present at rollout.
-- These are intentionally Partial until the watch process re-verifies the original issuer source.
UPDATE opportunities SET
  opportunity_summary='Capacity-building assignment focused on strengthening the Mabamba wetland ecotourism association. The opportunity is relevant where enterprise governance, member capacity, business systems, market readiness and facilitation are central to the scope.',
  fit_status='Good fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Strong overlap with Tuku-Tuku''s MSME capacity building, facilitation, business systems and organizational strengthening work. Domain-specific ecotourism and biodiversity requirements still need source verification.',
  strongest_matches='["MSME and association capacity building","Facilitation and curriculum delivery","Business systems and organizational strengthening","Uganda programme delivery"]'::jsonb,
  gaps='["Verify whether biodiversity, conservation or ecotourism-specific past performance is mandatory","Confirm entity eligibility and submission method"]'::jsonb,
  hard_blockers='["Deadline is 14 September 2026 and requires an immediate live-status check"]'::jsonb,
  decision_rationale='Good capability fit, but pursue only if the opportunity is still open and domain-specific eligibility can be met.',
  winning_strategy='Position Tuku-Tuku around enterprise strengthening, practical capacity building and local implementation; add a conservation/ecotourism specialist if the TOR requires specialist domain evidence.'
WHERE id='watch_undp_mabamba';

UPDATE opportunities SET
  opportunity_summary='Senior programme-operations role focused on translating programme plans into effective delivery, coordination, compliance and operational follow-through.',
  fit_status='Good fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Jacob has strong programme and operations leadership across training, innovation, community programmes and multi-district MSME delivery. Formal education and exact sector requirements need verification.',
  strongest_matches='["Programme and operations leadership","Multi-location delivery coordination","Partnership and stakeholder management","Training and implementation management"]'::jsonb,
  gaps='["Verify completed-degree requirement and whether equivalent experience is accepted","Check any child-protection or humanitarian-sector experience requirement","Confirm Kampala/location expectations"]'::jsonb,
  hard_blockers='["Deadline is 14 September 2026 and requires an immediate live-status check"]'::jsonb,
  decision_rationale='Apply only if the education and sector requirements do not create a hard eligibility block.',
  winning_strategy='Lead with programme execution, operational systems, stakeholder coordination and measurable delivery experience rather than technology product work.'
WHERE id='watch_savechildren_ops';

UPDATE opportunities SET
  opportunity_summary='Digital-system opportunity for an integrated e-waste data and inventory platform, likely involving data architecture, registry/inventory workflows, reporting and institutional use.',
  fit_status='Conditional fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Tuku-Tuku has relevant digital-platform, data-workflow and system-design capability, but direct e-waste/environmental domain expertise and public-sector technical thresholds are not yet evidenced.',
  strongest_matches='["Digital platform and workflow design","Data collection and reporting systems","Multi-role administration and dashboards","Uganda digital-systems delivery"]'::jsonb,
  gaps='["Direct e-waste/environmental data-domain specialist","Verify prior-contract value and public-procurement experience thresholds","Confirm architecture, security and interoperability requirements"]'::jsonb,
  hard_blockers='["A specialist consortium partner may be required if environmental qualifications are mandatory"]'::jsonb,
  decision_rationale='Best treated as a consortium opportunity, not a solo Tuku-Tuku bid, until the technical and domain criteria are verified.',
  winning_strategy='Pair Tuku-Tuku''s product/workflow capability with an e-waste or environmental-data specialist and, if needed, a senior systems architect.'
WHERE id='watch_nitau_ewaste';

UPDATE opportunities SET
  opportunity_summary='Institutional capacity-building assignment around Uganda ICT laws, regulations or policy implementation, with likely training, learning materials and stakeholder engagement components.',
  fit_status='Good fit',eligibility_status='Conditional',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Strong fit on curriculum development, ToT, facilitation and digital-literacy capacity building. The legal/ICT-law subject-matter requirement is the main gap.',
  strongest_matches='["Curriculum and training manual development","Training of trainers","Digital literacy and institutional capacity building","Facilitation and workshop delivery"]'::jsonb,
  gaps='["Senior ICT-law or legal-policy subject-matter expert","Verify required years and references for comparable assignments","Confirm PPDA/eGP submission requirements"]'::jsonb,
  hard_blockers='["Do not bid without the required legal/ICT policy expertise if named key experts are mandatory"]'::jsonb,
  decision_rationale='Recruit the specialist expertise and bid if the institutional experience thresholds are reachable.',
  winning_strategy='Tuku-Tuku leads training methodology, curriculum, facilitation and digital learning; recruit a qualified ICT-law expert for technical authority.'
WHERE id='watch_nitau_ict_laws';

UPDATE opportunities SET
  opportunity_summary='Regional social-protection advocacy and capacity-building opportunity involving rollout, stakeholder engagement, learning and communications across Sub-Saharan Africa.',
  fit_status='Good fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Good match on programme design, facilitation, partnerships and capacity building. Direct social-protection policy and high-level regional advocacy evidence needs verification.',
  strongest_matches='["Capacity-building programme design","Stakeholder and partnership engagement","Facilitation and knowledge products","Regional/Africa-oriented programme work"]'::jsonb,
  gaps='["Direct social-protection policy expertise","Regional advocacy portfolio and any named-language requirements","Verify whether application is individual, firm or consortium"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='Worth pursuing if the TOR allows a mixed team and does not require deep specialist social-protection credentials from every key expert.',
  winning_strategy='Position Tuku-Tuku on rollout methodology, partner engagement and capacity building; add a social-protection specialist if required.'
WHERE id='watch_unicef_ssa_advocacy';

UPDATE opportunities SET
  opportunity_summary='Global-programmes project-management role in a foundation setting, likely coordinating programme plans, partners, delivery timelines, budgets and reporting.',
  fit_status='Good fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Jacob''s programme management, community/partnership work and multi-stakeholder delivery are relevant. Foundation/sport-sector and formal qualification requirements need verification.',
  strongest_matches='["Programme and project management","Partner and stakeholder coordination","Multi-workstream delivery","Community and communications leadership"]'::jsonb,
  gaps='["Verify degree requirement and equivalency language","Check location/time-zone and travel requirements","Limited direct sport-for-development evidence"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='Strong enough to apply if geography and education requirements are open to Jacob''s profile.',
  winning_strategy='Translate MSME, innovation and community programme delivery into global-programme management language: planning, partner coordination, reporting, risk and execution.'
WHERE id='watch_volleyball_pm';

UPDATE opportunities SET
  opportunity_summary='Communications consultancy in a technology-for-development network context, likely covering strategic communications, content, stakeholder messaging and digital channels.',
  fit_status='Good fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Jacob has relevant communications leadership, community management and technology-sector experience. The exact portfolio, writing samples and international communications requirements need checking.',
  strongest_matches='["Director-level community and communications experience","Technology and innovation ecosystem experience","Content and stakeholder communications","Digital programme context"]'::jsonb,
  gaps='["Verify required years specifically in strategic communications","Confirm portfolio/writing-sample requirements","Check remote-location eligibility and contract rate expectations"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='Apply if remote eligibility is confirmed and the TOR values development/technology communications rather than specialist PR-agency credentials.',
  winning_strategy='Lead with Elephante Commons communications leadership, innovation ecosystem work and ability to translate technical/programme material into practical stakeholder communication.'
WHERE id='watch_nethope_comms';

UPDATE opportunities SET
  opportunity_summary='Evaluation assignment focused on equitable partnerships, likely requiring evaluation design, qualitative research, stakeholder engagement, synthesis and actionable recommendations.',
  fit_status='Good fit',eligibility_status='Conditional',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Tuku-Tuku/Jacob fit well on programme design, organizational learning, stakeholder engagement and MEL-oriented work, but senior evaluation credentials and comparable references need verification.',
  strongest_matches='["Programme design and learning","M&E/reporting and evidence synthesis","Stakeholder facilitation","Partnership and organizational-development experience"]'::jsonb,
  gaps='["Lead evaluator credentials and evaluation-methodology depth","Comparable evaluation references","Any required gender/equity specialist expertise"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='Consider with a senior evaluator if the TOR requires a deeper formal evaluation track record than Tuku-Tuku can show alone.',
  winning_strategy='Build a small evaluation team: Tuku-Tuku for programme/partnership context and field engagement, plus a strong evaluation-methods lead.'
WHERE id='watch_nca_partnerships_eval';

UPDATE opportunities SET
  opportunity_summary='Technical-assistance opportunity around commercial and industrial captive renewable-energy solutions in Uganda, combining market, technical and implementation support.',
  fit_status='Conditional fit',eligibility_status='Conditional',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Strong strategic fit on private-sector/MSME support, programme delivery and market engagement, but energy engineering and renewable-finance expertise are specialist gaps.',
  strongest_matches='["Private-sector and MSME advisory","Market and ecosystem engagement","Programme implementation","Business growth and investment-readiness support"]'::jsonb,
  gaps='["Renewable-energy technical specialist","Energy-finance/economics expertise","Verify C&I project references and required technical certifications"]'::jsonb,
  hard_blockers='["Do not prime alone if named senior energy specialists are mandatory"]'::jsonb,
  decision_rationale='Pursue through recruited specialists or consortium structure; Tuku-Tuku should own enterprise engagement and implementation methodology.',
  winning_strategy='Build an energy-specialist team around Tuku-Tuku''s business advisory, market systems and implementation capability.'
WHERE id='watch_uk_pact_renewables';

UPDATE opportunities SET
  opportunity_summary='Co-creation/proposal opportunity with War Child Canada, potentially involving youth, conflict-affected or refugee/host-community programming and collaborative programme design.',
  fit_status='Good fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Strong overlap with youth enterprise development, Northern Uganda delivery, programme design and refugee-host-community interests. Child-protection/humanitarian requirements need verification.',
  strongest_matches='["Youth entrepreneurship and enterprise development","Northern Uganda programme delivery","Programme and curriculum design","Refugee/host-community proposal direction"]'::jsonb,
  gaps='["Verify safeguarding/child-protection compliance requirements","Confirm whether prior humanitarian programme references are mandatory","Clarify co-creation scope and partner role"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='High strategic relevance if Tuku-Tuku can enter as an enterprise/livelihoods implementation or design partner.',
  winning_strategy='Position around youth livelihoods, enterprise support, digital systems and local implementation; complement with child-protection expertise where required.'
WHERE id='watch_warchild_q4';

UPDATE opportunities SET
  opportunity_summary='Senior social-entrepreneurship and project-development role combining venture/programme design, social-impact thinking, partnership development and execution.',
  fit_status='Strong fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Excellent thematic match to Jacob''s entrepreneurship-support, innovation, programme design, venture building and partnership experience. Formal education, geography and employer-specific requirements remain to be checked.',
  strongest_matches='["8+ years MSME and entrepreneurship support","Founder and innovation-management experience","Programme and project design","Partnerships and ecosystem building","Venture and digital-product building"]'::jsonb,
  gaps='["Verify formal degree requirement and whether equivalent experience is accepted","Confirm location/travel requirements","Check any sector-specific social-enterprise credentials"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='One of the strongest individual-fit opportunities in the current watchlist if formal eligibility checks clear.',
  winning_strategy='Frame Jacob as an operator who has designed and delivered enterprise programmes while also building ventures and digital products, rather than as a conventional consultant only.'
WHERE id='watch_suyana_social_entrepreneur';

UPDATE opportunities SET
  opportunity_summary='Communications, advocacy and regional-engagement consultancy connected to PMNCH/WHO, likely requiring strategic communications, stakeholder engagement, advocacy support and regional coordination.',
  fit_status='Good fit',eligibility_status='Conditional',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Tuku-Tuku/Jacob bring relevant communications leadership, partnerships and regional programme experience. Health-sector advocacy credentials and entity requirements are the main verification points.',
  strongest_matches='["Community and communications leadership","Partnership and stakeholder engagement","Programme design and coordination","Regional/Africa-oriented development work"]'::jsonb,
  gaps='["Health-sector or global-health advocacy evidence","Verify registered-entity requirements and required references","Confirm regional engagement/language requirements"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='Bid if the entity is eligible and the TOR allows strong communications/programme experience to compensate for limited direct global-health history.',
  winning_strategy='Use Tuku-Tuku as contracting entity with Jacob leading communications/engagement and add health-policy or advocacy expertise if the TOR requires it.'
WHERE id='watch_pmnch_who_comms';

UPDATE opportunities SET
  opportunity_summary='develoPPP programme opportunity supporting private-sector development projects with development impact, usually requiring a viable business case, development additionality and eligible company structure.',
  fit_status='Conditional fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Strategically relevant to Tuku-Tuku''s enterprise, digital and development work, but programme-specific company eligibility, financial contribution and project structure are decisive.',
  strongest_matches='["Private-sector development focus","MSME and entrepreneurship capability","Digital products and innovation","Uganda implementation context"]'::jsonb,
  gaps='["Verify applicant-company age/turnover and legal-form requirements","Confirm required own contribution/co-financing","Develop a commercially grounded project concept with development impact"]'::jsonb,
  hard_blockers='["Eligibility and co-financing requirements may rule out a direct application"]'::jsonb,
  decision_rationale='Do not treat as a generic grant; proceed only if Tuku-Tuku meets the company and co-financing rules or can partner with an eligible firm.',
  winning_strategy='Anchor the concept in a commercially viable Tuku product or service with measurable MSME/development impact and a credible private-sector co-investment case.'
WHERE id='watch_developpp_2026';

UPDATE opportunities SET
  opportunity_summary='Technical and M&E advisory opportunity requiring a blend of technical programme expertise, monitoring/evaluation design, learning and evidence use.',
  fit_status='Good fit',eligibility_status='Conditional',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Jacob/Tuku-Tuku match programme design, tools, reporting and implementation well, but the strongest posture is a team combining Jacob with a deeper specialist M&E profile.',
  strongest_matches='["Programme design and implementation","M&E/reporting and tool development","Facilitation and learning","MSME and development-programme experience"]'::jsonb,
  gaps='["Senior specialist M&E credentials if required","Verify technical subject-matter area and reference thresholds","Confirm whether a two-person team is allowed"]'::jsonb,
  hard_blockers='[]'::jsonb,
  decision_rationale='Recruit a complementary M&E/technical advisor and pursue as a small team if the TOR structure permits.',
  winning_strategy='Jacob leads programme/implementation methodology; pair with a technically stronger evaluator for credibility on advanced M&E requirements.'
WHERE id='watch_gdn_tme_advisor';

UPDATE opportunities SET
  opportunity_summary='European Youth Foundation grant opportunity for youth-focused civil-society initiatives linked to Council of Europe priorities.',
  fit_status='Weak fit',eligibility_status='Needs verification',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='The youth-programming theme is relevant, but geographic and organizational eligibility may be a hard mismatch for a Uganda-based organization.',
  strongest_matches='["Youth enterprise and capacity-building programmes","Programme design","Training and facilitation"]'::jsonb,
  gaps='["Verify whether a Uganda-based organization is eligible","Confirm required European youth-organization status or partnership structure","Check thematic alignment with Council of Europe priorities"]'::jsonb,
  hard_blockers='["Geographic/organizational eligibility may make a direct Tuku-Tuku application impossible"]'::jsonb,
  decision_rationale='Keep only if eligibility or an eligible partnership route is confirmed; otherwise close as not eligible.',
  winning_strategy='Do not spend proposal effort until organizational and geographic eligibility is verified.'
WHERE id='watch_eyf_2027';

UPDATE opportunities SET
  opportunity_summary='Enabel Uganda tender for an Innovation Challenge for Trainers of Trainers in mini hubs. The pursuit combines enterprise/innovation training methodology with named digital-expert capacity and formal procurement compliance.',
  fit_status='Strong fit',eligibility_status='Conditional',assessment_status='Partial',assessment_confidence='High',
  fit_summary='Very strong institutional fit for Tuku-Tuku on ToT, entrepreneurship/MSME support, curriculum, innovation and Northern Uganda delivery. The main risk is satisfying the named expert and procurement evidence requirements.',
  strongest_matches='["Training of trainers and facilitator development","MSME and entrepreneurship-support methodology","Curriculum/manual and toolkit development","Innovation and incubation programme design","Northern Uganda delivery experience"]'::jsonb,
  gaps='["Confirm qualifying Team Lead CV","Confirm two qualifying Digital Expert CVs","Verify exact tender reference, turnover and administrative documentation thresholds","Capture clarifications from the 17 September information session"]'::jsonb,
  hard_blockers='["Named key experts must meet the tender criteria","Procurement compliance documents must be complete"]'::jsonb,
  deliverables='["Innovation challenge / ToT delivery methodology","Training materials and facilitation outputs","Mini-hub trainer capacity building and related reporting"]'::jsonb,
  application_requirements='["Technical proposal","Financial proposal","Key expert CVs and evidence","Required legal/administrative tender documents","Comparable assignment references"]'::jsonb,
  decision_rationale='Priority bid. The opportunity is highly aligned, but submission quality depends on closing the expert-CV and compliance gaps.',
  winning_strategy='Tuku-Tuku leads the methodology, curriculum, enterprise-support and local-delivery case; recruit only specialists who clearly clear the named expert thresholds and build a compliance matrix against every tender requirement.'
WHERE id='watch_enabel_uga22003_10452';

UPDATE opportunities SET
  opportunity_summary='Digital coordination and monitoring-system opportunity for refugee partnerships, likely combining registry/workflow design, monitoring, dashboards, stakeholder coordination and institutional implementation.',
  fit_status='Strong fit',eligibility_status='Conditional',assessment_status='Partial',assessment_confidence='Medium',
  fit_summary='Excellent thematic overlap with Tuku-Tuku''s digital systems, programme management, data workflows and refugee/host-community direction. A consortium is likely needed for senior systems, security and domain credentials.',
  strongest_matches='["Digital platform and workflow design","Programme and portfolio monitoring","Data dashboards and reporting","Refugee/host-community programme direction","Uganda institutional context"]'::jsonb,
  gaps='["Senior enterprise/system architecture credentials","Security/interoperability and government-system integration expertise","Direct refugee-sector institutional references","Verify procurement and past-contract thresholds"]'::jsonb,
  hard_blockers='["Likely unsuitable as a solo bid if senior architecture or large-contract references are mandatory"]'::jsonb,
  decision_rationale='High-value consortium target: Tuku-Tuku should pursue a defined implementation/product role rather than overstate prime-contractor credentials.',
  winning_strategy='Assemble a consortium with senior architecture/security and refugee-domain partners; position Tuku-Tuku around workflow/product design, implementation methodology, user adoption and programme-monitoring logic.'
WHERE id='watch_nitau_refugee_coord';
