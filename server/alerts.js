// ── JAKE Alert System ──
// Telegram Bot API  — 100% free
// Resend Email API  — free tier: 3,000 emails/month
// WhatsApp via Callmebot — free (requires one-time WhatsApp setup)
//
// Required env vars:
//   TELEGRAM_BOT_TOKEN  — from @BotFather on Telegram
//   TELEGRAM_CHAT_ID    — your personal chat ID (get from @userinfobot)
//   RESEND_API_KEY      — from resend.com (free)
//   ALERT_FROM_EMAIL    — e.g. jake@yourdomain.com
//   ALERT_TO_EMAIL      — where you want to receive alerts
//
// Optional WhatsApp (Callmebot):
//   WHATSAPP_PHONE      — your phone with country code, no + (e.g. 256712345678)
//   WHATSAPP_APIKEY     — from Callmebot setup (message +34 644 72 56 82 on WhatsApp:
//                         "I allow callmebot to send me messages" to get your key)

// ── Telegram ──
async function sendTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token)  return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  if (!chatId) return { ok: false, error: 'TELEGRAM_CHAT_ID not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, message_id: data.result?.message_id };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── WhatsApp via Callmebot (free) ──
async function sendWhatsApp(message) {
  const phone  = process.env.WHATSAPP_PHONE;
  const apiKey = process.env.WHATSAPP_APIKEY;
  if (!phone)  return { ok: false, error: 'WHATSAPP_PHONE not set — add your number (no +, with country code)' };
  if (!apiKey) return { ok: false, error: 'WHATSAPP_APIKEY not set — set up Callmebot first' };
  try {
    const text = encodeURIComponent(message);
    const url  = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${text}&apikey=${apiKey}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    if (body.toLowerCase().includes('message queued') || res.ok) return { ok: true };
    return { ok: false, error: body.slice(0, 200) };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Resend Email ──
async function sendEmail({ subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.ALERT_FROM_EMAIL || 'JAKE <onboarding@resend.dev>';
  const to     = process.env.ALERT_TO_EMAIL;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  if (!to)     return { ok: false, error: 'ALERT_TO_EMAIL not set' };
  try {
    const res  = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, html, text })
    });
    const data = await res.json();
    if (res.status >= 400) return { ok: false, error: data.message || JSON.stringify(data) };
    return { ok: true, id: data.id };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Helpers ──
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function daysLabel(dateStr) {
  const d = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (d === 0) return 'TODAY';
  if (d === 1) return 'TOMORROW';
  if (d < 0)   return `${Math.abs(d)}d ago`;
  return `in ${d}d`;
}
function buildDeadlineAlerts(events) {
  const today = new Date();
  return {
    urgent: events.filter(e => { if (e.done) return false; const d = Math.ceil((new Date(e.date) - today) / 86400000); return d >= 0 && d <= 3; }),
    week:   events.filter(e => { if (e.done) return false; const d = Math.ceil((new Date(e.date) - today) / 86400000); return d > 3 && d <= 7; }),
    today:  events.filter(e => { if (e.done) return false; const d = Math.ceil((new Date(e.date) - today) / 86400000); return d === 0; }),
  };
}

// ── Telegram digest builder ──
function buildTelegramDigest(events, data = {}) {
  const { urgent, week, today } = buildDeadlineAlerts(events);
  const { finance, followups, pipeline } = data;

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  let msg = `🌅 *JAKE Morning Brief*\n_${dateStr}_\n\n`;

  // Financial snapshot
  const confirmed = (finance?.streams || []).filter(s => s.status === 'Confirmed').reduce((s, x) => s + x.amount, 0);
  const pending   = (finance?.streams || []).filter(s => s.status === 'Pending').reduce((s, x) => s + x.amount, 0);
  if (confirmed || pending) {
    msg += `💰 *Revenue* — $${confirmed.toLocaleString()} confirmed · $${pending.toLocaleString()} pending\n\n`;
  }

  // Today's events
  if (today.length) {
    msg += `📅 *Today*\n`;
    today.forEach(e => { msg += `• ${e.title}${e.project ? ` _(${e.project})_` : ''}\n`; });
    msg += '\n';
  }

  // Pipeline snapshot
  if (pipeline?.length) {
    const inDelivery = pipeline.filter(p => p.stage === 'In Delivery' && p.valueUSD > 0);
    const applied    = pipeline.filter(p => p.stage === 'Applied' && p.valueUSD > 0);
    if (inDelivery.length || applied.length) {
      msg += `📊 *Pipeline*\n`;
      inDelivery.forEach(p => { msg += `• ✅ ${p.name} — $${p.valueUSD?.toLocaleString()}\n`; });
      applied.forEach(p => { msg += `• ⏳ ${p.name} — $${p.valueUSD?.toLocaleString()}\n`; });
      msg += '\n';
    }
  }

  // Urgent deadlines
  if (urgent.length) {
    msg += `🔴 *Urgent — Next 3 Days*\n`;
    urgent.forEach(e => { msg += `• *${e.title}*\n  ${e.project} · ${formatDate(e.date)} _(${daysLabel(e.date)})_\n`; });
    msg += '\n';
  }

  // This week
  if (week.length) {
    msg += `🟡 *This Week*\n`;
    week.forEach(e => { msg += `• ${e.title} — ${formatDate(e.date)}\n`; });
    msg += '\n';
  }

  // CRM follow-ups
  if (followups?.length) {
    msg += `📋 *Follow-ups Due*\n`;
    followups.slice(0, 3).forEach(f => { msg += `• ${f.message}\n`; });
    msg += '\n';
  }

  if (!urgent.length && !week.length && !today.length) {
    msg += `✅ Clear schedule today — no urgent deadlines.\n\n`;
  }

  msg += `_JAKE · Tuku-Tuku Labs_`;
  return msg;
}

// ── Email HTML builder ──
function buildEmailHTML(events, data = {}) {
  const { urgent, week, today } = buildDeadlineAlerts(events);
  const { finance, followups, pipeline } = data;

  const confirmed = (finance?.streams || []).filter(s => s.status === 'Confirmed').reduce((s, x) => s + x.amount, 0);
  const pending   = (finance?.streams || []).filter(s => s.status === 'Pending').reduce((s, x) => s + x.amount, 0);

  const rows = (arr, color) => arr.map(e => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1A2030;color:${color};font-weight:600">${escHtml(e.title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1A2030;color:#5C6680">${escHtml(e.project || '')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1A2030;color:${color};font-family:monospace">${formatDate(e.date)} (${daysLabel(e.date)})</td>
    </tr>`).join('');

  const pipelineHTML = pipeline?.filter(p => p.stage === 'In Delivery' || p.stage === 'Applied')
    .map(p => `<tr>
      <td style="padding:7px 12px;border-bottom:1px solid #1A2030;color:#DDE3F0">${escHtml(p.name)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #1A2030;color:#5C6680">${escHtml(p.org)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #1A2030;color:${p.stage === 'In Delivery' ? '#0ECB81' : '#F0B429'};font-family:monospace">${p.valueUSD > 0 ? '$' + p.valueUSD.toLocaleString() : 'TBD'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #1A2030;color:${p.stage === 'In Delivery' ? '#0ECB81' : '#F0B429'};font-size:11px">${escHtml(p.stage)}</td>
    </tr>`).join('') || '';

  const todaySection = today.length ? `
    <div style="padding:16px 24px;border-bottom:1px solid #1A2030">
      <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#5E6AD2;margin:0 0 10px">📅 Today</h2>
      ${today.map(e => `<div style="padding:5px 0;font-size:13px;color:#DDE3F0">• ${escHtml(e.title)} <span style="color:#5C6680;font-size:11px">${escHtml(e.project || '')}</span></div>`).join('')}
    </div>` : '';

  const followupsSection = followups?.length ? `
    <div style="padding:16px 24px;border-bottom:1px solid #1A2030">
      <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9F7AEA;margin:0 0 10px">📋 CRM Follow-ups Due</h2>
      ${followups.slice(0, 5).map(f => `<div style="padding:4px 0;font-size:12px;color:#DDE3F0">• ${escHtml(f.message)}</div>`).join('')}
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#07090F;color:#DDE3F0;font-family:'Segoe UI',sans-serif;margin:0;padding:0">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;padding:32px 16px">
<tr><td>
  <div style="background:#0D1117;border:1px solid #1A2030;border-radius:12px;overflow:hidden">
    <div style="background:#131820;padding:20px 24px;border-bottom:1px solid #1A2030">
      <div style="background:#F0B429;color:#07090F;font-weight:800;font-size:13px;display:inline-block;padding:4px 10px;border-radius:6px;margin-bottom:10px">JAKE</div>
      <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-0.5px">Morning Briefing</h1>
      <p style="color:#5C6680;margin:0;font-size:13px">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>

    <!-- Finance snapshot -->
    <div style="padding:20px 24px;border-bottom:1px solid #1A2030;display:flex;gap:12px">
      <div style="flex:1;background:#131820;border:1px solid rgba(14,203,129,.2);border-radius:8px;padding:12px 14px">
        <div style="font-size:20px;font-weight:700;color:#0ECB81">$${confirmed.toLocaleString()}</div>
        <div style="font-size:11px;color:#5C6680;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Confirmed Revenue</div>
      </div>
      <div style="flex:1;background:#131820;border:1px solid rgba(240,180,41,.2);border-radius:8px;padding:12px 14px">
        <div style="font-size:20px;font-weight:700;color:#F0B429">$${pending.toLocaleString()}</div>
        <div style="font-size:11px;color:#5C6680;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Pending Pipeline</div>
      </div>
    </div>

    ${todaySection}

    <!-- Active pipeline -->
    ${pipelineHTML ? `
    <div style="padding:16px 24px;border-bottom:1px solid #1A2030">
      <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#0ECB81;margin:0 0 10px">📊 Active Pipeline</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1A2030;border-radius:8px;overflow:hidden">${pipelineHTML}</table>
    </div>` : ''}

    ${urgent.length ? `
    <div style="padding:16px 24px;border-bottom:1px solid #1A2030">
      <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#FF4757;margin:0 0 12px">🔴 Urgent — Next 3 Days</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1A2030;border-radius:8px;overflow:hidden">${rows(urgent, '#FF4757')}</table>
    </div>` : ''}

    ${week.length ? `
    <div style="padding:16px 24px;border-bottom:1px solid #1A2030">
      <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#F0B429;margin:0 0 12px">🟡 This Week</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1A2030;border-radius:8px;overflow:hidden">${rows(week, '#DDE3F0')}</table>
    </div>` : ''}

    ${!urgent.length && !week.length ? `
    <div style="padding:16px 24px;border-bottom:1px solid #1A2030">
      <p style="color:#0ECB81;margin:0;font-size:14px">✅ Clear schedule — no urgent deadlines this week.</p>
    </div>` : ''}

    ${followupsSection}

    <div style="padding:16px 24px;background:#0A0C12">
      <p style="color:#2A3050;font-size:11px;margin:0;font-family:monospace">JAKE · Tuku-Tuku Innovation Labs · Northern Uganda</p>
    </div>
  </div>
</td></tr></table></body></html>`;
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Main digest — sends to Email + Telegram + WhatsApp ──
async function sendDeadlineDigest(events, data = {}) {
  const results = {};

  // Telegram
  const tgMsg = buildTelegramDigest(events, data);
  results.telegram = tgMsg
    ? await sendTelegram(tgMsg)
    : { ok: true, skipped: 'No content for digest' };

  // WhatsApp (short version — same as Telegram but trimmed for WA)
  const waPhone = process.env.WHATSAPP_PHONE;
  if (waPhone) {
    // Send a concise WhatsApp version (strip Markdown formatting)
    const waMsgPlain = tgMsg
      ? tgMsg.replace(/\*/g, '').replace(/_/g, '').slice(0, 1000)
      : 'No digest today.';
    results.whatsapp = await sendWhatsApp(waMsgPlain);
  } else {
    results.whatsapp = { ok: false, skipped: 'WHATSAPP_PHONE not set' };
  }

  // Email
  results.email = await sendEmail({
    subject: `JAKE — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} Briefing`,
    html: buildEmailHTML(events, data),
    text: tgMsg ? tgMsg.replace(/\*/g, '').replace(/_/g, '') : 'No urgent deadlines today.',
  });

  return results;
}

async function sendAlert({ message, subject, channels = ['telegram', 'email'] }) {
  const results = {};
  if (channels.includes('telegram')) results.telegram = await sendTelegram(message);
  if (channels.includes('whatsapp')) results.whatsapp = await sendWhatsApp(message);
  if (channels.includes('email'))    results.email    = await sendEmail({ subject: subject || 'JAKE Alert', html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${escHtml(message)}</pre>`, text: message });
  return results;
}

module.exports = { sendTelegram, sendWhatsApp, sendEmail, sendDeadlineDigest, sendAlert, buildDeadlineAlerts };
