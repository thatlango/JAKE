import { useState, useRef, useEffect } from 'react';

const COMMANDS = [
  { label: 'Summarise my week',             icon: '📊', prompt: 'Give me a concise summary of my week — what I completed, what\'s coming up, and what I should focus on.' },
  { label: 'What\'s due this week?',        icon: '📅', prompt: 'What deadlines, follow-ups, and deliverables are due in the next 7 days?' },
  { label: 'Draft 2X Global follow-up',     icon: '✉️', prompt: 'Draft a professional follow-up email to 2X Global about the gender-smart business tools opportunity ($24,000). Keep it concise and action-oriented.' },
  { label: 'Cash flow risk check',          icon: '💸', prompt: 'Analyse my cash flow situation. What are the risks when 4Africa ends in June? What should I do about the revenue gap?' },
  { label: 'Pipeline strategy',             icon: '⟳', prompt: 'Review my business development pipeline. What should I prioritise and what deals need attention?' },
  { label: 'Prepare for next meeting',      icon: '🤝', prompt: 'Help me prepare talking points for my next client or partner meeting.' },
  { label: 'Next 3 actions right now',      icon: '⚡', prompt: 'Based on everything in JAKE — projects, pipeline, calendar, finance — what are the 3 most important things I should do in the next 2 hours?' },
  { label: 'Write a project status update', icon: '📋', prompt: 'Draft a professional project status update I can send to a stakeholder. Ask me which project.' },
];

const SYSTEM = `You are JAKE — Jacob's personal AI operating system assistant. Jacob Odur (Odur Lango) is the Founder of Tuku-Tuku Innovation Labs, a Uganda-based MSME capacity building firm in Northern Uganda (Gulu & Lira).

Active projects: Radar (AI job platform, Next.js/Supabase/GPT-4), Synced (couples finance app), Ajura Clothes (fashion brand), 4Africa Incubator (12-week agri program, ends June 2026), Tuku-Tuku MSME workshops.

Key pipeline: 2X Global gender-smart tools ($24K, applied), FEMINATURE FMS ($3.5K, in delivery), Palladium & GOPA AFC ongoing partnerships.

Confirmed revenue: ~$17.3K. Monthly costs: ~$480. 

Be direct, specific, and actionable. Reference Jacob's actual projects and context. Never give generic advice. Treat him as a smart founder, not a student.`;

export default function CommandCenter({ navigate }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  // Global keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');

    // Check for navigation commands
    const navMap = { dashboard: 'dashboard', projects: 'projects', pipeline: 'pipeline', calendar: 'calendar', finance: 'finance', crm: 'crm', radar: 'radar', invoices: 'cashflow', 'cash flow': 'cashflow', alerts: 'alerts' };
    const lower = q.toLowerCase();
    for (const [kw, mod] of Object.entries(navMap)) {
      if ((lower.includes(`go to ${kw}`) || lower.includes(`open ${kw}`) || lower.includes(`show ${kw}`)) && navigate) {
        navigate(mod);
        setOpen(false);
        return;
      }
    }

    const newMessages = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, systemPrompt: SYSTEM })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || data.error || 'No response';
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: `⚠️ ${e.message}` }]);
    }
    setLoading(false);
  };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      style={{
        position: 'fixed', bottom: 80, right: 16, zIndex: 150,
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--accent)', color: '#07090F',
        border: 'none', fontSize: 20, cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(240,180,41,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Syne, sans-serif', fontWeight: 800,
        WebkitTapHighlightColor: 'transparent',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
      title="AI Command Center (⌘K)"
    >
      ✦
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', background: 'rgba(7,9,15,0.92)', backdropFilter: 'blur(8px)' }} onClick={() => setOpen(false)}>
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 700, width: '100%', margin: '0 auto', padding: '60px 16px 16px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'var(--accent)', color: '#07090F', width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 14 }}>✦</div>
          <div style={{ flex: 1, fontFamily: 'Syne, sans-serif', fontSize: 18, fontWeight: 700, letterSpacing: '-0.4px' }}>JAKE Command Center</div>
          <kbd style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>⌘K</kbd>
          <button onClick={() => setOpen(false)} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Conversation */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {messages.length === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {COMMANDS.map((cmd, i) => (
                <button key={i} onClick={() => send(cmd.prompt)} style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 12px', textAlign: 'left', cursor: 'pointer', color: 'var(--text)',
                  fontSize: 12.5, lineHeight: 1.4, transition: 'all 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <span style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>{cmd.icon}</span>
                  {cmd.label}
                </button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: m.role === 'user' ? 'var(--accent)' : 'var(--blue)' }}>
                {m.role === 'user' ? 'You' : 'JAKE AI'}
              </div>
              <div style={{
                background: m.role === 'user' ? 'var(--accent-dim)' : 'var(--surface-2)',
                border: `1px solid ${m.role === 'user' ? 'rgba(240,180,41,.15)' : 'var(--border)'}`,
                borderRadius: 8, padding: '10px 14px', fontSize: 14, lineHeight: 1.7,
                color: 'var(--text)', whiteSpace: 'pre-wrap'
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 4 }}>JAKE AI</div>
              <div className="ai-loading"><span /><span /><span /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '6px 6px 6px 14px', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask anything, or say 'go to pipeline', 'open radar'…"
            rows={2}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, resize: 'none', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.5 }}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading} style={{
            width: 36, height: 36, background: input.trim() ? 'var(--accent)' : 'var(--surface-3)',
            color: input.trim() ? '#07090F' : 'var(--text-dim)',
            border: 'none', borderRadius: 7, fontSize: 16, cursor: input.trim() ? 'pointer' : 'default',
            flexShrink: 0, transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>↑</button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 8 }}>Enter to send · Shift+Enter for new line · Esc to close</div>
      </div>
    </div>
  );
}
