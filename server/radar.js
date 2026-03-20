'use strict';
const db = require('./db');

const PROFILE_KEYWORDS = ['MSME','SME','capacity building','training','consultant','agriculture','Uganda','East Africa','Northern Uganda','gender','women','youth','USAID','GIZ','FCDO','incubator','entrepreneurship','cooperative','digital literacy','financial literacy'];
const ANTI_KEYWORDS = ['engineering','construction','ICT tender','software development bid','printing services'];

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
      const deadlineM = item.description.match(/deadline[:\s]+(\d{1,2}[\s\-/]\w+[\s\-/]20\d\d|\w+ \d{1,2},? 20\d\d)/i);
      const budgetM = item.description.match(/\$[\d,]+|\d+,000\s*USD|USD\s*[\d,]+/i);
      const id = `opp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      await db.insert('opportunities', { id, title:item.title.slice(0,200), org:source.name, source:source.name,
        source_url:(item.link||'').slice(0,500), deadline:deadlineM?deadlineM[1]:null,
        budget:budgetM?budgetM[0]:'', description:item.description.slice(0,1000),
        relevance_score:score, relevance_reason:matched.slice(0,5).join(', '), status:'New',
        tags:matched.slice(0,5).join(','), saved:false, seen:false });
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

module.exports = { scanAll, fetchSource, getOpportunities, updateOpportunity, getSources, scoreOpportunity };
