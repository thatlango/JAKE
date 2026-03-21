'use strict';
// ── JAKE Weekly Business Digest ──
// Runs every Monday at 07:00 EAT (04:00 UTC)
// Netlify scheduled function — configure via netlify.toml [functions."weekly-digest"]
// Free: uses existing Claude + Telegram/WhatsApp/Email integrations

const { schedule } = require('@netlify/functions');
const { sendAlert }  = require('../../server/alerts');
const db             = require('../../server/db');

const API_KEY = process.env.ANTHROPIC_API_KEY;

async function askClaude(prompt) {
  if (!API_KEY) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const d = await r.json();
    return d.content?.[0]?.text || null;
  } catch { return null; }
}

async function runDigest() {
  if (!db.isReady()) return { ok: false, error: 'DB not ready' };

  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const in14  = new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10);

  // Gather data
  const [events, pipeline, crmClients] = await Promise.all([
    db.all('calendar_events', { eq:{done:false}, gte:{date:today}, order:{col:'date'}, limit:15 }),
    db.all('pipeline',        { order:{col:'created_at',asc:false}, limit:12 }),
    db.all('crm_clients',     { order:{col:'name'}, limit:30 }),
  ]);

  const upcoming   = events.filter(e => e.date <= in14);
  const hotDeals   = pipeline.filter(p => ['Applied','In Delivery'].includes(p.stage));
  const overdueCtx = crmClients.filter(c => {
    if (!c.last_contact) return true;
    return Math.floor((now - new Date(c.last_contact)) / 86400000) > 30;
  }).slice(0, 5);

  const pipelineTotal = pipeline.filter(p => p.value_usd > 0).reduce((s, p) => s + p.value_usd, 0);

  // Build data summary for Claude
  const dataSummary = `
WEEKLY REVIEW — ${now.toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}

PIPELINE: ${pipeline.length} deals, $${pipelineTotal.toLocaleString()} total
Hot deals: ${hotDeals.map(d=>`${d.name} (${d.org}, ${d.stage})`).join('; ') || 'None'}

NEXT 14 DAYS: ${upcoming.length} events
${upcoming.map(e=>`- ${e.date}: ${e.title} [${e.project||''}]`).join('\n')}

CRM OVERDUE: ${overdueCtx.length} contacts not reached in 30+ days
${overdueCtx.map(c=>`- ${c.name} (${c.org||''})`).join('\n')}
`.trim();

  // Generate AI review
  const aiReview = await askClaude(
    `You are Jacob's personal business assistant at Tuku-Tuku Labs, Uganda. Write a concise Monday morning business review (200 words max) based on this data:\n\n${dataSummary}\n\nStructure: 1) One-line situation summary, 2) Top 3 priorities for the week (numbered), 3) One risk to watch. Be direct and specific. No fluff.`
  );

  // Build message
  const lines = [
    `🗓 *JAKE Weekly Review* — ${now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}`,
    '',
    aiReview || dataSummary,
    '',
    `📊 Pipeline: ${pipeline.length} deals · $${pipelineTotal.toLocaleString()} total`,
    `🔥 Hot: ${hotDeals.length} in delivery/applied`,
    `📅 Events (14d): ${upcoming.length}`,
    overdueCtx.length > 0 ? `⚠️ CRM: ${overdueCtx.length} overdue contacts` : '✅ CRM: all contacts recent',
    '',
    '_From JAKE — your operating system_',
  ];

  const message = lines.join('\n');

  const result = await sendAlert({
    message,
    subject: `JAKE Weekly Review — ${now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}`,
    channels: ['telegram', 'whatsapp', 'email'],
  });

  return { ok: true, sent: result };
}

// Schedule: Monday 04:00 UTC = 07:00 EAT
module.exports.handler = schedule('0 4 * * 1', async () => {
  try {
    const result = await runDigest();
    console.log('[weekly-digest]', JSON.stringify(result));
    return { statusCode: 200 };
  } catch (e) {
    console.error('[weekly-digest] error:', e.message);
    return { statusCode: 500 };
  }
});
