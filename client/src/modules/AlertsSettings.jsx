import { useState } from 'react';

const SECRETS = [
  { key: 'ANTHROPIC_API_KEY',   label: 'Anthropic API Key',        desc: 'AI assistant. Free at console.anthropic.com',             req: true,  url: 'https://console.anthropic.com' },
  { key: 'TELEGRAM_BOT_TOKEN',  label: 'Telegram Bot Token',       desc: 'Create a bot free via @BotFather on Telegram → /newbot',  req: false, url: 'https://t.me/BotFather' },
  { key: 'TELEGRAM_CHAT_ID',    label: 'Telegram Chat ID',         desc: 'Get your ID: message @userinfobot on Telegram',           req: false, url: 'https://t.me/userinfobot' },
  { key: 'WHATSAPP_PHONE',      label: 'WhatsApp Phone Number',    desc: 'Your number with country code, no + (e.g. 256712345678)', req: false, url: null },
  { key: 'WHATSAPP_APIKEY',     label: 'WhatsApp API Key (Callmebot)', desc: 'Free key from Callmebot — follow setup guide below',   req: false, url: null },
  { key: 'RESEND_API_KEY',      label: 'Resend API Key',           desc: 'Free email API. 3,000 emails/month free at resend.com',   req: false, url: 'https://resend.com' },
  { key: 'ALERT_FROM_EMAIL',    label: 'Alert From Email',         desc: 'e.g. jake@yourdomain.com — configure in Resend dashboard',req: false, url: null },
  { key: 'ALERT_TO_EMAIL',      label: 'Alert Destination Email',  desc: 'Where you want to receive daily briefings',               req: false, url: null },
  { key: 'SMS_WEBHOOK_SECRET',  label: 'SMS Webhook Secret',       desc: 'Protects your SMS webhook. Set any strong random string', req: false, url: null },
  { key: 'JAKE_INTERNAL_KEY',   label: 'Internal API Key',         desc: 'Optional: locks down sync/delete endpoints',              req: false, url: null },
];

const SETUP_STEPS = [
  {
    icon: '🤖',
    title: 'Telegram Bot (free)',
    steps: [
      'Open Telegram → search @BotFather → send /newbot',
      'Choose a name: "JAKE Alerts" and username e.g. jake_alerts_bot',
      'Copy the token → add to Netlify env vars as TELEGRAM_BOT_TOKEN',
      'Start a chat with your new bot (search its username)',
      'Message @userinfobot → it replies with your chat ID',
      'Add that ID as TELEGRAM_CHAT_ID in Netlify env vars',
      'Click "Test Telegram" below to confirm it works',
    ]
  },
  {
    icon: '📱',
    title: 'WhatsApp via Callmebot (free)',
    steps: [
      'Save +34 644 72 56 82 in your phone as "Callmebot"',
      'Send this message on WhatsApp to that number: I allow callmebot to send me messages',
      'You will receive your personal API key via WhatsApp (looks like: 1234567)',
      'In Netlify → Site settings → Environment variables, add:',
      '  WHATSAPP_PHONE = your number with country code, no + (e.g. 256712345678)',
      '  WHATSAPP_APIKEY = the key you received from Callmebot',
      'Redeploy your Netlify site, then click "Test WhatsApp" below',
    ]
  },
  {
    icon: '✉️',
    title: 'Resend Email (free — 3,000/month)',
    steps: [
      'Go to resend.com → Sign up free (no card needed)',
      'Create an API key → add as RESEND_API_KEY in Netlify env vars',
      'Add your sending domain (or use Resend\'s free shared domain for testing)',
      'Set ALERT_FROM_EMAIL and ALERT_TO_EMAIL in Netlify env vars',
      'Click "Test Email" below to confirm',
    ]
  },
];

export default function AlertsSettings({ calendar, finance, openAI }) {
  const [sending, setSending] = useState({});
  const [results, setResults] = useState({});

  const test = async (channel) => {
    setSending(s => ({ ...s, [channel]: true }));
    try {
      const res = await fetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      setResults(r => ({ ...r, [channel]: data.ok ? '✅ Sent!' : `❌ ${data.error || JSON.stringify(data)}` }));
    } catch (e) {
      setResults(r => ({ ...r, [channel]: `❌ ${e.message}` }));
    }
    setSending(s => ({ ...s, [channel]: false }));
  };

  const sendDigest = async () => {
    setSending(s => ({ ...s, digest: true }));
    setResults(r => ({ ...r, digest: null }));
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendar, finance }),
      });
      const res = await fetch('/api/alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'digest' }),
      });
      const data = await res.json();
      const tg = data.result?.telegram;
      const em = data.result?.email;
      const wa = data.result?.whatsapp;
      setResults(r => ({
        ...r,
        digest: [
          tg?.ok  ? '✅ Telegram'  : tg?.skipped  ? `ℹ️ ${tg.skipped}`  : `❌ Telegram: ${tg?.error}`,
          em?.ok  ? '✅ Email'     :                                       `❌ Email: ${em?.error}`,
          wa?.ok  ? '✅ WhatsApp'  : wa?.skipped  ? `ℹ️ WhatsApp: not configured` : `❌ WhatsApp: ${wa?.error}`,
        ].join('   |   '),
      }));
    } catch (e) {
      setResults(r => ({ ...r, digest: `❌ ${e.message}` }));
    }
    setSending(s => ({ ...s, digest: false }));
  };

  const upcoming = calendar
    .filter(e => !e.done && new Date(e.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6);

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Alerts & Notifications</h1>
          <p className="module-sub">Telegram · WhatsApp · Email · Daily digest at 07:00 EAT — all free</p>
        </div>
        <button className="ai-trigger" onClick={() => openAI('Walk me through setting up JAKE alerts with Telegram, WhatsApp and Email')}>✦ Ask AI</button>
      </div>

      <div className="module-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Channel cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {[
            { key: 'telegram', icon: '💬', title: 'Telegram',        desc: 'Free. Works globally. Instant. No number verification needed for bots.' },
            { key: 'whatsapp', icon: '📱', title: 'WhatsApp',        desc: 'Free via Callmebot. Receive digests directly in your WhatsApp chats.' },
            { key: 'email',    icon: '✉️', title: 'Email via Resend', desc: 'Free tier: 3,000 emails/month. Clean HTML digest. No SMTP config.' },
            { key: 'digest',   icon: '🗓', title: 'Daily Digest',    desc: 'Auto-fires at 07:00 EAT. Sends to all configured channels at once.' },
          ].map(({ key, icon, title, desc }) => (
            <div key={key} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{desc}</div>
              <button
                className="ai-trigger-sm"
                onClick={() => key === 'digest' ? sendDigest() : test(key)}
                disabled={!!sending[key]}
              >
                {sending[key] ? '⟳ Sending…' : key === 'digest' ? 'Send Now' : `Test ${title.split(' ')[0]}`}
              </button>
              {results[key] && (
                <div style={{
                  marginTop: 8, fontSize: 11, lineHeight: 1.5,
                  color: String(results[key]).includes('❌') ? 'var(--red)' : 'var(--green)',
                }}>
                  {results[key]}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* WhatsApp Callmebot highlight */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid rgba(16,185,129,.25)', borderRadius: 8, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28, flexShrink: 0 }}>📱</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>WhatsApp Morning Digest — Quick Setup</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8 }}>
              <strong style={{ color: 'var(--text)' }}>Step 1:</strong> Save <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3 }}>+34 644 72 56 82</code> in your phone contacts as <em>Callmebot</em><br />
              <strong style={{ color: 'var(--text)' }}>Step 2:</strong> Send <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3 }}>I allow callmebot to send me messages</code> to that number on WhatsApp<br />
              <strong style={{ color: 'var(--text)' }}>Step 3:</strong> You'll receive your API key back in WhatsApp within seconds<br />
              <strong style={{ color: 'var(--text)' }}>Step 4:</strong> In <strong>Netlify → Site settings → Environment variables</strong>, add:<br />
              &nbsp;&nbsp;&nbsp;• <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3, color: 'var(--cyan)' }}>WHATSAPP_PHONE</code> = your number with country code, no + (e.g. <code>256712345678</code>)<br />
              &nbsp;&nbsp;&nbsp;• <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3, color: 'var(--cyan)' }}>WHATSAPP_APIKEY</code> = the key Callmebot sent you<br />
              <strong style={{ color: 'var(--text)' }}>Step 5:</strong> Trigger a Netlify redeploy, then click <strong>Test WhatsApp</strong> above
            </div>
          </div>
        </div>

        {/* Upcoming preview */}
        <div className="card">
          <div className="card-header">What your next digest will contain</div>
          {upcoming.length === 0
            ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No upcoming events — nothing will be sent</div>
            : upcoming.map(e => {
              const days = Math.ceil((new Date(e.date) - new Date()) / 86400000);
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: days <= 3 ? 'var(--red)' : 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13 }}>{e.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.project}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: days <= 3 ? 'var(--red)' : days <= 7 ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`}
                  </span>
                </div>
              );
            })
          }
        </div>

        {/* Setup guides */}
        {SETUP_STEPS.map(s => (
          <div key={s.title} className="card">
            <div className="card-header">{s.icon} {s.title} — Setup Guide</div>
            <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.steps.map((step, i) => (
                <li key={i} style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{step}</li>
              ))}
            </ol>
          </div>
        ))}

        {/* Secrets checklist */}
        <div className="card">
          <div className="card-header">⚙ Netlify Environment Variables Checklist</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
            Go to <strong style={{ color: 'var(--accent)' }}>Netlify → Site settings → Environment variables → Add variable</strong> for each value below.
          </p>
          {SECRETS.map(s => (
            <div key={s.key} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.req ? 'var(--red)' : 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--cyan)', marginBottom: 2 }}>{s.key}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {s.desc}
                  {s.url && <> — <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>get it here ↗</a></>}
                </div>
              </div>
              {s.req && <span className="badge badge--critical" style={{ flexShrink: 0, marginTop: 2 }}>Required</span>}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
