'use strict';
// ── JAKE API — Netlify Serverless Function ──
// Wraps the entire Express app via serverless-http.
// Handles all /api/* routes (redirected from netlify.toml)

const express      = require('express');
const serverless   = require('serverless-http');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const { sendDeadlineDigest, sendAlert } = require('../../server/alerts');
const { parseSMS }   = require('../../server/sms-parser');
const gcal           = require('../../server/gcal');
const db             = require('../../server/db');
const invoices       = require('../../server/invoices');
const crm            = require('../../server/crm');
const radar          = require('../../server/radar');

const app = express();
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false }));
const uid = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

// Helmet (without CSP — Netlify headers handle that)
app.use(helmet({ contentSecurityPolicy: false, hsts: false }));

// In-memory cache per cold start (gcal events)
const cache = { gcalEvents: [] };

const API_KEY = process.env.ANTHROPIC_API_KEY;

// Validate helper
function validate(validators) {
  return [...validators, (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: errors.array().map(e=>e.msg) });
    next();
  }];
}

// ── HEALTH ──
app.get('/health', (_, res) => res.json({ status: 'ok', app: 'JAKE', version: '4.0', db: db.isReady(), time: new Date().toISOString() }));

// ── CLAUDE AI ──
app.post('/claude',
  validate([
    body('messages').isArray({ min:1, max:50 }),
    body('messages.*.role').isIn(['user','assistant']),
    body('messages.*.content').isString().trim().isLength({ min:1, max:8000 }),
  ]),
  async (req, res) => {
    if (!API_KEY) return res.status(503).json({ error: 'AI unavailable — add ANTHROPIC_API_KEY to Netlify env vars' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key':API_KEY, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1500, system:req.body.systemPrompt, messages:req.body.messages })
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); return res.status(r.status).json({ error: e.error?.message||'AI failed' }); }
      res.json(await r.json());
    } catch { res.status(502).json({ error: 'Could not reach AI' }); }
  }
);

// ── SYNC ──
app.post('/sync', async (req, res) => {
  if (Array.isArray(req.body.calendar)) {
    const rows = req.body.calendar.slice(0,500).map(e => ({
      id:e.id, title:e.title||'', date:e.date||'', project:e.project||'', type:e.type||'session', done:!!e.done, notes:e.notes||''
    }));
    await db.insertMany('calendar_events', rows);
  }
  if (Array.isArray(req.body.pipeline)) {
    const rows = req.body.pipeline.slice(0,200).map(p => ({
      id:p.id, name:p.name||'', org:p.org||'', value:p.value||'', value_usd:p.valueUSD||0,
      stage:p.stage||'Prospect', type:p.type||'Consulting', deadline:p.deadline||null,
      contact:p.contact||'', notes:p.notes||''
    }));
    await db.insertMany('pipeline', rows);
  }
  res.json({ ok: true });
});

// ── ALERTS ──
app.post('/alerts/send', async (req, res) => {
  try {
    const events = await db.all('calendar_events', { eq:{done:false}, gte:{date:new Date().toISOString().slice(0,10)}, order:{col:'date'} });
    const result = req.body.type === 'digest'
      ? await sendDeadlineDigest(events, {})
      : await sendAlert({ message:String(req.body.message||'').slice(0,2000), subject:String(req.body.subject||'').slice(0,200), channels:req.body.channels });
    res.json({ ok:true, result });
  } catch { res.status(500).json({ ok:false, error:'Alert dispatch failed' }); }
});

app.post('/alerts/test', async (req, res) => {
  const channel = req.body.channel === 'email' ? 'email' : 'telegram';
  try {
    const r = await sendAlert({ message:`✅ JAKE test — ${new Date().toLocaleString('en-GB')}`, subject:'JAKE — Test Alert', channels:[channel] });
    res.json(r[channel]||{ok:false});
  } catch { res.status(500).json({ ok:false, error:'Test failed' }); }
});

// ── SMS ──
app.post('/sms/receive', async (req, res) => {
  const body = (req.body.text||req.body.Body||req.body.message||req.body.sms||'').trim().slice(0,2000);
  const from = (req.body.from||req.body.From||req.body.sender||'').trim().slice(0,50);
  if (!body) return res.status(400).json({ error:'No SMS body' });
  const entry = parseSMS(body, from, req.body.date||new Date().toISOString())
    || { id:`sms_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, type:'unparsed', raw:body, sender:from, timestamp:new Date().toISOString() };
  await db.insert('sms_transactions', { id:entry.id, type:entry.type||'unparsed', flow:entry.flow||'', amount:entry.amount||0, party:entry.party||'', provider:entry.provider||'', category:entry.category||'Other', timestamp:entry.timestamp, raw:entry.raw||body, sender:entry.sender||from, note:'', currency:'UGX' }, true);
  res.status(200).send('');
});

app.get('/sms/transactions', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit)||100, 500);
  res.json({ transactions: await db.all('sms_transactions', { order:{col:'timestamp',asc:false}, limit }) });
});

app.delete('/sms/transactions/:id', async (req, res) => {
  await db.del('sms_transactions', req.params.id.slice(0,100));
  res.json({ ok:true });
});

app.patch('/sms/transactions/:id', async (req, res) => {
  await db.update('sms_transactions', req.params.id.slice(0,100), { note:String(req.body.note||'').slice(0,500), category:String(req.body.category||'').slice(0,50) });
  res.json({ ok:true });
});

// ── GOOGLE CALENDAR ──
app.get('/gcal/status', (_, res) => res.json(gcal.getStatus()));

app.get('/gcal/events', (_, res) => {
  if (!gcal.isConnected()) return res.json({ events:[], connected:false });
  res.json({ events:cache.gcalEvents, connected:true, email:gcal.getStatus().email });
});

app.post('/gcal/sync', async (req, res) => {
  if (!gcal.isConnected()) return res.status(400).json({ error:'Not connected' });
  try {
    cache.gcalEvents = await gcal.getAllEvents({ days:90 });
    res.json({ ok:true, count:cache.gcalEvents.length, events:cache.gcalEvents });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.post('/gcal/disconnect', (_, res) => {
  gcal.disconnect(); cache.gcalEvents = [];
  res.json({ ok:true });
});

// ── INVOICES ──
app.get('/invoices', async (req, res) => {
  res.json({ invoices: await invoices.getInvoices(req.query.status) });
});

app.post('/invoices', async (req, res) => {
  const inv = await invoices.createInvoice(req.body);
  res.json({ ok:true, invoice:inv });
});

app.patch('/invoices/:id/status', async (req, res) => {
  const allowed = ['Draft','Sent','Paid','Overdue','Cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error:'Invalid status' });
  await invoices.updateStatus(req.params.id, req.body.status);
  res.json({ ok:true });
});

app.get('/invoices/:id/html', async (req, res) => {
  const inv = await db.get('invoices', { eq:{ id:req.params.id } });
  if (!inv) return res.status(404).json({ error:'Not found' });
  res.type('html').send(invoices.generateHTML(inv));
});

app.delete('/invoices/:id', async (req, res) => {
  await db.del('invoices', req.params.id);
  res.json({ ok:true });
});

// ── CRM ──
app.get('/crm/clients', async (req, res) => {
  const [clients, stats] = await Promise.all([crm.getClients(req.query.status), crm.getCRMStats()]);
  res.json({ clients, stats });
});

app.get('/crm/clients/:id', async (req, res) => {
  const client = await crm.getClient(req.params.id);
  if (!client) return res.status(404).json({ error:'Not found' });
  res.json({ client });
});

app.post('/crm/clients', async (req, res) => {
  const client = await crm.createClient(req.body);
  res.json({ ok:true, client });
});

app.patch('/crm/clients/:id', async (req, res) => {
  await crm.updateClient(req.params.id, req.body);
  res.json({ ok:true });
});

app.delete('/crm/clients/:id', async (req, res) => {
  await crm.deleteClient(req.params.id);
  res.json({ ok:true });
});

app.post('/crm/clients/:id/interactions', async (req, res) => {
  const id = await crm.logInteraction(req.params.id, req.body);
  res.json({ ok:true, id });
});

app.post('/crm/clients/:id/followup', async (req, res) => {
  await crm.scheduleFollowup(req.params.id, req.body);
  res.json({ ok:true });
});

// ── PROJECTS ──
app.get('/projects', async (_, res) => {
  res.json({ projects: await db.all('projects', { order: { col: 'name' } }) });
});

app.post('/projects', async (req, res) => {
  const payload = {
    id: req.body.id || uid('proj'),
    name: String(req.body.name || '').trim(),
    emoji: req.body.emoji || '🚀',
    description: req.body.description || '',
    tech: req.body.tech || '',
    status: req.body.status || 'Planning',
    priority: req.body.priority || 'Medium',
    color: req.body.color || '#5E6AD2',
    progress: Number(req.body.progress || 0),
    tasks: Array.isArray(req.body.tasks) ? req.body.tasks : [],
  };
  if (!payload.name) return res.status(400).json({ error: 'Project name is required' });
  const project = await db.insert('projects', payload, true);
  res.json({ ok: true, project: project || payload });
});

app.patch('/projects/:id', async (req, res) => {
  await db.update('projects', req.params.id, {
    tasks: Array.isArray(req.body.tasks) ? req.body.tasks : [],
    progress: Number(req.body.progress || 0),
  });
  res.json({ ok: true });
});

// ── PIPELINE / PROSPECTS ──
app.get('/pipeline', async (_, res) => {
  res.json({ pipeline: await db.all('pipeline', { order: { col: 'created_at', asc: false } }) });
});

app.post('/pipeline', async (req, res) => {
  const valueUSD = Number(req.body.valueUSD || 0);
  const payload = {
    id: req.body.id || uid('pipe'),
    name: String(req.body.name || '').trim(),
    org: String(req.body.org || '').trim(),
    valueUSD,
    value: req.body.value || (valueUSD > 0 ? `$${valueUSD.toLocaleString()}` : 'TBD'),
    stage: req.body.stage || 'Prospect',
    type: req.body.type || 'Partnership',
    deadline: req.body.deadline || null,
    contact: req.body.contact || '',
    notes: req.body.notes || '',
  };
  if (!payload.name || !payload.org) return res.status(400).json({ error: 'Name and organization are required' });
  const item = await db.insert('pipeline', payload, true);
  res.json({ ok: true, item: item || payload });
});

// ── OPPORTUNITY RADAR ──
app.get('/radar/opportunities', async (req, res) => {
  res.json({
    opportunities: await radar.getOpportunities({ status:req.query.status, saved:req.query.saved==='1' }),
    sources: await radar.getSources(),
  });
});

app.post('/radar/scan', async (req, res) => {
  try {
    const results = await radar.scanAll();
    res.json({ ok:true, results });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

app.patch('/radar/opportunities/:id', async (req, res) => {
  await radar.updateOpportunity(req.params.id, req.body);
  res.json({ ok:true });
});

app.delete('/radar/opportunities/:id', async (req, res) => {
  await db.del('opportunities', req.params.id);
  res.json({ ok:true });
});

// ── CASH FLOW ──
app.get('/cashflow', async (req, res) => {
  const [streams, expenses, invList] = await Promise.all([
    db.all('finance_streams', { order:{col:'month'} }),
    db.all('expenses', { order:{col:'name'} }),
    db.all('invoices', { order:{col:'due_date'} }),
  ]);
  const monthlyExpenses = expenses.filter(e=>e.monthly).reduce((s,e)=>s+e.amount,0);
  const now = new Date();
  const projection = [0,1,2].map(i => {
    const d = new Date(now.getFullYear(), now.getMonth()+i, 1);
    const label = d.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
    const ms = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const income = streams.filter(s=>s.month&&s.month.includes(String(d.getFullYear()))&&s.status!=='Projected').reduce((s,x)=>s+x.amount,0);
    const invIncome = invList.filter(v=>v.due_date&&v.due_date.startsWith(ms)&&v.status==='Sent').reduce((s,v)=>s+v.total,0);
    return { label, month:ms, income:income+invIncome, expenses:monthlyExpenses, net:(income+invIncome)-monthlyExpenses };
  });
  res.json({ streams, expenses, invoices:invList, projection, monthlyExpenses });
});

// ── FETCH STATS PROXY ──
app.get('/fetch-stats', async (req, res) => {
  let url; try { url = new URL(req.query.url); } catch { return res.status(400).json({ error:'Invalid URL' }); }
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1)/.test(url.hostname))
    return res.status(403).json({ error:'Private URLs not allowed' });
  try {
    const r = await fetch(url.toString(), { headers:{'User-Agent':'JAKE/4.0'}, signal:AbortSignal.timeout(8000) });
    const text = await r.text();
    if ((r.headers.get('content-type')||'').includes('application/json')) { try { return res.json(JSON.parse(text)); } catch {} }
    res.type('text/plain').send(text.slice(0,50000));
  } catch { res.status(502).json({ error:'Could not fetch URL' }); }
});

// Seed DB on first function invocation
let seeded = false;
async function ensureSeeded() {
  if (seeded || !db.isReady()) return;
  await db.seedIfEmpty().catch(()=>{});
  seeded = true;
}

// Seed on warm start
ensureSeeded();

// Wrap for serverless — strips the /.netlify/functions/api prefix
const handler = serverless(app, {
  request(req) {
    // Netlify passes the full path including function prefix — normalise it
    req.url = req.url.replace(/^\/?api\//, '/').replace(/^\/\.netlify\/functions\/api/, '');
    if (!req.url.startsWith('/')) req.url = '/' + req.url;
    ensureSeeded();
  }
});

module.exports = { handler };
