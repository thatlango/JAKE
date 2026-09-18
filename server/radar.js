'use strict';
const db = require('./db');
const {enqueueOpportunity} = require('./opportunity-intake');

const PROFILE_KEYWORDS = [
  'MSME','SME','entrepreneurship','enterprise development','private sector development','business development services','BDS',
  'incubation','accelerator','innovation ecosystem','youth employment','youth livelihoods','refugee','host community','livelihoods',
  'market systems','agribusiness','agriculture','value chain','cooperative','financial inclusion','digital transformation',
  'AI for development','artificial intelligence','digital public infrastructure','DPI','monitoring and evaluation','MEL',
  'research','evaluation','capacity building','training','training of trainers','ToT','curriculum','facilitation','programme design',
  'program design','programme implementation','technical assistance','consultancy','consultant','framework agreement','roster',
  'prequalification','supplier','grant','innovation challenge','Uganda','East Africa','Africa','remote'
];
const ANTI_KEYWORDS = [
  'civil works','road construction','building construction','supply of fuel','office furniture','vehicle supply','medical supplies',
  'pharmaceutical','armed security','catering services','cleaning services','printing only'
];
const HIGH_VALUE_TYPES = ['consult','technical assistance','advisory','programme','program','research','evaluation','capacity building',
  'framework','roster','prequalification','supplier','grant','challenge','implementation','training','digital','innovation'];
const GEO_KEYWORDS = ['uganda','east africa','africa','african','remote','global','kenya','tanzania','rwanda','burundi','south sudan','drc','congo'];
const STRONG_THEMES = ['msme','sme','entrepreneur','enterprise','youth','refugee','livelihood','innovation','digital','artificial intelligence',
  'ai ','market system','private sector','agribusiness','value chain','resilience','business continuity','research','evaluation','mel',
  'capacity building','training','curriculum','facilitation','programme','program','financial inclusion','cooperative'];

function qualifiesForJacobOrTuku(item={}) {
  const haystack=[item.title,item.description,item.org,item.source].filter(Boolean).join(' ').toLowerCase();
  const anti=ANTI_KEYWORDS.filter(k=>haystack.includes(k));
  const themes=STRONG_THEMES.filter(k=>haystack.includes(k));
  const types=HIGH_VALUE_TYPES.filter(k=>haystack.includes(k));
  const geos=GEO_KEYWORDS.filter(k=>haystack.includes(k));
  // Keep the intake deliberately narrow: thematic fit plus a monetisable/strategic opportunity signal.
  // Uganda is implicitly acceptable; broader opportunities need an Africa/remote/global signal.
  const geographicFit=geos.length>0 || haystack.includes('uganda');
  const qualified=anti.length===0 && themes.length>0 && types.length>0 && geographicFit;
  return {qualified,themes,types,geos,anti};
}

function scoreOpportunity(title='', description='') {
  const text = (title+' '+description).toLowerCase();
  let score = 0; const matched = [];
  PROFILE_KEYWORDS.forEach(kw => { if (text.includes(kw.toLowerCase())) { score+=10; matched.push(kw); } });
  ANTI_KEYWORDS.forEach(kw => { if (text.includes(kw.toLowerCase())) score-=20; });
  return { score: Math.max(0, Math.min(100, score)), matched };
}

function parseRSS(xml) {
  const items = []; const re = /<item[^>]*>([\s\S]*?)<\/item>/gi; let m;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const tag = n => { const r = new RegExp(`<${n}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${n}>|<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i'); const t = r.exec(b); return t ? (t[1]||t[2]||'').trim() : ''; };
    const title = tag('title'); const link = tag('link')||tag('guid'); const desc = tag('description').replace(/<[^>]+>/g,'').slice(0,500);
    if (title) items.push({ title, link, description: desc, pubDate: tag('pubDate') });
  }
  return items;
}

async function fetchSource(source) {
  try {
    const res = await fetch(source.url, { headers:{'User-Agent':'JAKE-Radar/4.0'}, signal:AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseRSS(await res.text());
    const existing = new Set((await db.all('opportunities', { select:'source_url' })).map(o => o.source_url));
    let added = 0;
    for (const item of items.slice(0,20)) {
      if (existing.has(item.link)) continue;
      const { score, matched } = scoreOpportunity(item.title, item.description);
      if (score < 30) continue;
      const fit=qualifiesForJacobOrTuku({...item,source:source.name,org:source.name});
      if(!fit.qualified) continue;
      const deadlineM = item.description.match(/deadline[:\s]+(\d{1,2}[\s\-/]\w+[\s\-/]20\d\d|\w+ \d{1,2},? 20\d\d)/i);
      const budgetM = item.description.match(/\$[\d,]+|\d+,000\s*USD|USD\s*[\d,]+/i);
      await enqueueOpportunity({
        title:item.title.slice(0,200),org:source.name,source:source.name,source_url:(item.link||'').slice(0,500),
        deadline:deadlineM?deadlineM[1]:null,budget:budgetM?budgetM[0]:'',description:item.description.slice(0,1000),
        relevance_score:score,relevance_reason:matched.slice(0,8).join(', '),status:'New',tags:[...fit.themes,...fit.types].slice(0,10).join(','),
        saved:false,seen:false,audience:'Both',stage:'Discover',fit_status:'Needs assessment',eligibility_status:'Needs verification',
        assessment_status:'Unassessed',assessment_confidence:'Low',
        opportunity_summary:'Radar-qualified lead awaiting source verification and full JakeOS assessment.',
        next_action:'Verify the original issuer source, assess mandatory eligibility and enrich before bid/apply decision.',
        source_context:`Radar source: ${source.name}. Narrow-route themes: ${fit.themes.join(', ')}. Opportunity signals: ${fit.types.join(', ')}.`
      },{source:'radar'});
      added++;
    }
    await db.update('opportunity_sources', source.id, { last_checked: new Date().toISOString() });
    return { source:source.name, found:items.length, added };
  } catch (e) { return { source:source.name, found:0, added:0, error:e.message }; }
}

async function scanAll() {
  const sources = await db.all('opportunity_sources', { eq:{ active:true } });
  const results = await Promise.allSettled(sources.map(fetchSource));
  return results.map(r => r.value||r.reason);
}

async function getOpportunities({ status, saved, limit=50 }={}) {
  const opts = { order:{ col:'relevance_score', asc:false }, limit };
  if (status) opts.eq = { status };
  if (saved !== undefined) opts.eq = { ...opts.eq, saved: !!saved };
  return db.all('opportunities', opts);
}

async function updateOpportunity(id, updates) {
  const allowed = ['status','saved','notes','seen'];
  const clean = Object.fromEntries(Object.entries(updates).filter(([k])=>allowed.includes(k)));
  if (Object.keys(clean).length) await db.update('opportunities', id, clean);
}

async function getSources() { return db.all('opportunity_sources', { order:{ col:'name' } }); }

module.exports = { scanAll, fetchSource, getOpportunities, updateOpportunity, getSources, scoreOpportunity, qualifiesForJacobOrTuku };
