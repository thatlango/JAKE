// ── JAKE Alert System ──
// Telegram Bot API  — 100% free, no credit card
// Resend Email API  — free tier: 3,000 emails/month
//
// Replit Secrets needed:
//   TELEGRAM_BOT_TOKEN  — from @BotFather on Telegram (free)
//   TELEGRAM_CHAT_ID    — your personal chat ID (get from @userinfobot)
//   RESEND_API_KEY      — from resend.com (free, no card needed)
//   ALERT_FROM_EMAIL    — e.g. jake@yourdomain.com (add a free domain in Resend)
//   ALERT_TO_EMAIL      — where you want to receive alerts

// ── Telegram ──
async function sendTelegram(message) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token)  return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set in Secrets' };
  if (!chatId) return { ok: false, error: 'TELEGRAM_CHAT_ID not set in Secrets' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, message_id: data.result?.message_id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Resend Email ──
async function sendEmail({ subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.ALERT_FROM_EMAIL || 'JAKE <onboarding@resend.dev>';
  const to     = process.env.ALERT_TO_EMAIL;

  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set — get free key at resend.com' };
  if (!to)     return { ok: false, error: 'ALERT_TO_EMAIL not set in Secrets' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ from, to, subject, html, text })
    });
    const data = await res.json();
    if (res.status >= 400) return { ok: false, error: data.message || JSON.stringify(data) };
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Helpers ──
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function daysLabel(dateStr) {
  const d = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  if (d === 0) return 'TODAY';
  if (d === 1) return 'TOMORROW';
  if (d < 0)  return `${Math.abs(d)}d ago`;
  return `in ${d}d`;
}

function buildDeadlineAlerts(events) {
  const today = new Date();
  const urgent = events.filter(e => {
    if (e.done) return false;
    const d = Math.ceil((new Date(e.date) - today) / 86400000);
    return d >= 0 && d <= 3;
  });
  const week = events.filter(e => {
    if (e.done) return false;
    const d = Math.ceil((new Date(e.date) - today) / 86400000);
    return d > 3 && d <= 7;
  });
  return { urgent, week };
}

// ── Telegram message builder ──
function buildTelegramMessage(events) {
  const { urgent, week } = buildDeadlineAlerts(events);
  if (!urgent.length && !week.length) return null;

  let msg = `📋 *JAKE — Deadline Alert*\n_${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}_\n\n`;

  if (urgent.length) {
    msg += `🔴 *URGENT — next 3 days*\n`;
    urgent.forEach(e => {
      msg += `• *${e.title}*\n  ${e.project} · ${formatDate(e.date)} _(${daysLabel(e.date)})_\n`;
    });
    msg += '\n';
  }
  if (week.length) {
    msg += `🟡 *This week*\n`;
    week.forEach(e => {
      msg += `• ${e.title} — ${formatDate(e.date)}\n`;
    });
  }

  msg += `\n_JAKE · Tuku-Tuku Labs_`;
  return msg;
}

// ── Email HTML builder ──
function buildEmailHTML(events, finance) {
  const { urgent, week } = buildDeadlineAlerts(events);
  const confirmed = (finance?.streams || []).filter(s => s.status === 'Confirmed').reduce((s, x) => s + x.amount, 0);
  const pending   = (finance?.streams || []).filter(s => s.status === 'Pending').reduce((s, x) => s + x.amount, 0);

  const rows = (arr, color) => arr.map(e => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #1A2030;color:${color};font-weight:600">${escHtml(e.title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1A2030;color:#5C6680">${escHtml(e.project)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #1A2030;color:${color};font-family:monospace">${formatDate(e.date)} (${daysLabel(e.date)})</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#07090F;color:#DDE3F0;font-family:'Segoe UI',sans-serif;margin:0;padding:0">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:32px 16px">
<tr><td>
  <div style="background:#0D1117;border:1px solid #1A2030;border-radius:12px;overflow:hidden">
    <div style="background:#131820;padding:20px 24px;border-bottom:1px solid #1A2030">
      <div style="background:#F0B429;color:#07090F;font-weight:800;font-size:13px;display:inline-block;padding:4px 10px;border-radius:6px;margin-bottom:10px">JAKE</div>
      <h1 style="font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-0.5px">Daily Briefing</h1>
      <p style="color:#5C6680;margin:0;font-size:13px">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>
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
    ${urgent.length ? `
    <div style="padding:20px 24px;border-bottom:1px solid #1A2030">
      <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#FF4757;margin:0 0 12px">🔴 Urgent — Next 3 Days</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1A2030;border-radius:8px;overflow:hidden">${rows(urgent,'#FF4757')}</table>
    </div>` : ''}
    ${week.length ? `
    <div style="padding:20px 24px;border-bottom:1px solid #1A2030">
      <h2 style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#F0B429;margin:0 0 12px">🟡 This Week</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1A2030;border-radius:8px;overflow:hidden">${rows(week,'#DDE3F0')}</table>
    </div>` : ''}
    <div style="padding:16px 24px;background:#0A0C12">
      <p style="color:#2A3050;font-size:11px;margin:0;font-family:monospace">JAKE · Tuku-Tuku Innovation Labs · Northern Uganda</p>
    </div>
  </div>
</td></tr></table></body></html>`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Main digest ──
async function sendDeadlineDigest(events, finance) {
  const results = {};

  const tgMsg = buildTelegramMessage(events);
  results.telegram = tgMsg
    ? await sendTelegram(tgMsg)
    : { ok: true, skipped: 'No deadlines in next 7 days' };

  results.email = await sendEmail({
    subject: `JAKE — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })} Briefing`,
    html: buildEmailHTML(events, finance),
    text: tgMsg || 'No urgent deadlines today.'
  });

  return results;
}

async function sendAlert({ message, subject, channels = ['telegram', 'email'] }) {
  const results = {};
  if (channels.includes('telegram')) results.telegram = await sendTelegram(message);
  if (channels.includes('email'))    results.email    = await sendEmail({ subject: subject || 'JAKE Alert', html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${escHtml(message)}</pre>`, text: message });
  return results;
}

module.exports = { sendTelegram, sendEmail, sendDeadlineDigest, sendAlert, buildDeadlineAlerts };
