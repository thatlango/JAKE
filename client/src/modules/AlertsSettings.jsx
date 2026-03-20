import { useState } from 'react';

const SECRETS = [
  { key: 'ANTHROPIC_API_KEY',   label: 'Anthropic API Key',      desc: 'AI assistant. Free at console.anthropic.com',          req: true,  url: 'https://console.anthropic.com' },
  { key: 'TELEGRAM_BOT_TOKEN',  label: 'Telegram Bot Token',     desc: 'Create a bot free via @BotFather on Telegram → /newbot', req: false, url: 'https://t.me/BotFather' },
  { key: 'TELEGRAM_CHAT_ID',    label: 'Telegram Chat ID',       desc: 'Get your ID: message @userinfobot on Telegram',         req: false, url: 'https://t.me/userinfobot' },
  { key: 'RESEND_API_KEY',      label: 'Resend API Key',         desc: 'Free email API. 3,000 emails/month free at resend.com', req: false, url: 'https://resend.com' },
  { key: 'ALERT_FROM_EMAIL',    label: 'Alert From Email',       desc: 'e.g. jake@yourdomain.com — configure in Resend dashboard', req: false, url: null },
  { key: 'ALERT_TO_EMAIL',      label: 'Alert Destination Email',desc: 'Where you want to receive daily briefings',             req: false, url: null },
  { key: 'SMS_WEBHOOK_SECRET',  label: 'SMS Webhook Secret',     desc: 'Protects your SMS webhook. Set any strong random string', req: false, url: null },
  { key: 'JAKE_INTERNAL_KEY',   label: 'Internal API Key',       desc: 'Optional: locks down sync/delete endpoints. Set any random string', req: false, url: null },
];

const SETUP_STEPS = [
  {
    icon: '🤖',
    title: 'Telegram Bot (free)',
    steps: [
      'Open Telegram → search @BotFather → send /newbot',
      'Choose a name: "JAKE Alerts" and username e.g. jake_alerts_bot',
      'Copy the token → add to Replit Secrets as TELEGRAM_BOT_TOKEN',
      'Start a chat with your new bot (search its username)',
      'Message @userinfobot → it replies with your chat ID',
      'Add that ID as TELEGRAM_CHAT_ID in Secrets',
      'Click "Test Telegram" below to confirm it works',
    ]
  },
  {
    icon: '✉️',
    title: 'Resend Email (free — 3,000/month)',
    steps: [
      'Go to resend.com → Sign up free (no card needed)',
      'Create an API key → add as RESEND_API_KEY in Secrets',
      'Add your sending domain (or use Resend\'s free shared domain for testing)',
      'Set ALERT_FROM_EMAIL and ALERT_TO_EMAIL in Secrets',
      'Click "Test Email" below to confirm',
    ]
  }
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
        body: JSON.stringify({ channel })
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
        body: JSON.stringify({ calendar, finance })
      });
      const res = await fetch('/api/alerts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'digest' })
      });
      const data = await res.json();
      const tg = data.result?.telegram;
      const em = data.result?.email;
      setResults(r => ({
        ...r,
        digest: [
          tg?.ok ? '✅ Telegram sent' : tg?.skipped ? `ℹ️ ${tg.skipped}` : `❌ Telegram: ${tg?.error}`,
          em?.ok ? '✅ Email sent'    : `❌ Email: ${em?.error}`
        ].join('   |   ')
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
          <p className="module-sub">Telegram · Email via Resend · Daily digest at 07:00 EAT — all free</p>
        </div>
        <button className="ai-trigger" onClick={() => openAI('Walk me through setting up JAKE alerts')}>✦ Ask AI</button>
      </div>

      <div className="module-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Channel cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { key: 'telegram', icon: '💬', title: 'Telegram', desc: 'Free. Works globally. Instant. No number verification needed for bots.' },
            { key: 'email',    icon: '✉️', title: 'Email via Resend', desc: 'Free tier: 3,000 emails/month. Clean HTML digest. No SMTP config.' },
            { key: 'digest',   icon: '🗓', title: 'Daily Digest', desc: 'Auto-fires at 07:00 EAT. Sends to both channels simultaneously.' },
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
                  color: String(results[key]).includes('❌') ? 'var(--red)' : 'var(--green)'
                }}>
                  {results[key]}
                </div>
              )}
            </div>
          ))}
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
          <div className="card-header">⚙ Replit Secrets Checklist</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
            Go to <strong style={{ color: 'var(--accent)' }}>Replit sidebar → Tools → Secrets</strong> and add each value below. None of these are visible in source code.
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
