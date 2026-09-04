import { useEffect, useMemo, useRef, useState } from 'react';

const BASE_COMMANDS = [
  { label: 'What should I do next?', prompt: 'Using live JakeOS context, give me the three highest-leverage actions I should take next. Explain why each matters now.' },
  { label: 'What needs attention?', prompt: 'Review live JakeOS context and surface only unresolved items that genuinely need my attention today: overdue work, stalled deals, missed follow-ups, money risks, or estate anomalies.' },
  { label: 'Plan the next two hours', prompt: 'Build a realistic plan for my next two hours from the live work queue and calendar. Prioritise impact and fit tasks into the time available.' },
  { label: 'Review business development', prompt: 'Review my current pipeline and relationship context. Tell me what pursuit or follow-up is most likely to move revenue or partnerships forward now.' },
  { label: 'Check project risk', prompt: 'Review active projects and identify the project with the highest execution risk, what is causing it, and the next decision or action required.' },
  { label: 'Estate movement', prompt: 'Review Tuku Estate activity. Tell me what changed, which products are moving, which are inactive, and whether anything deserves intervention.' },
];

const MODULE_COMMANDS = {
  work: [
    { label: 'Explain this ranking', prompt: 'Explain why the current top work items are ranked in that order in plain language. Do not quote numeric ranking scores.' },
    { label: 'What can wait?', prompt: 'From the current work queue, tell me what can safely wait and why.' },
  ],
  projects: [
    { label: 'Which project is at risk?', prompt: 'Review active project health and tell me which project deserves intervention first, why, and the next action.' },
    { label: 'Find blocked delivery', prompt: 'Find stalled or blocked project work and propose the shortest path to movement.' },
  ],
  pipeline: [
    { label: 'Which deal needs action?', prompt: 'Review the pipeline and identify the pursuit that most needs action now. Consider value, age, stage and next-action urgency.' },
    { label: 'Find stale pursuits', prompt: 'Find pursuits that are stale or overdue and tell me whether to follow up, reframe, or close them.' },
  ],
  crm: [
    { label: 'Who should I contact?', prompt: 'Review relationship activity and tell me which contacts I should reach out to next and why.' },
    { label: 'Prepare follow-ups', prompt: 'Identify relationship follow-ups due now and give me concise next steps.' },
  ],
  estate: [
    { label: 'What changed in the estate?', prompt: 'Review estate telemetry and summarise meaningful product usage, growth, order and earnings movement.' },
    { label: 'Which product needs attention?', prompt: 'Identify the Tuku product that most needs intervention based on live usage and commercial signals.' },
  ],
};

const SYSTEM = `You are Jake, the intelligence layer inside JakeOS, a personal command center. Use live JakeOS data when it is supplied. Your job is to interpret the operating system, not repeat dashboard numbers. Be concise, specific, and actionable. Prefer: what changed, what matters, why now, what to do next, and what can wait. Do not expose internal ranking scores unless explicitly asked. Never invent missing data.`;

export default function CommandCenter({ navigate, module = 'dashboard' }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);

  const suggestions = useMemo(() => {
    const contextual = MODULE_COMMANDS[module] || [];
    return [...contextual, ...BASE_COMMANDS].slice(0, 6);
  }, [module]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('jake:open', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('jake:open', openHandler);
    };
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

    const navMap = {
      dashboard: 'dashboard', overview: 'dashboard', work: 'work', projects: 'projects', pipeline: 'pipeline',
      calendar: 'calendar', finance: 'finance', crm: 'crm', relationships: 'crm', radar: 'radar', opportunities: 'radar',
      estate: 'estate', invoices: 'cashflow', money: 'cashflow', alerts: 'alerts', grants: 'grants', proposals: 'proposals'
    };
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
      let liveContext = '';
      try {
        const overviewResponse = await fetch('/api/overview');
        if (overviewResponse.ok) {
          const overview = await overviewResponse.json();
          liveContext = `\n\nCurrent JakeOS module: ${module}.\nLive JakeOS overview JSON:\n${JSON.stringify(overview).slice(0, 9000)}`;
        }
      } catch {}

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, systemPrompt: `${SYSTEM}${liveContext}` })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || data.error || 'Jake could not produce a response.';
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: `Jake could not respond: ${e.message}` }]);
    }
    setLoading(false);
  };

  if (!open) return (
    <button className="px-jake-fab" onClick={() => setOpen(true)} title="Ask Jake (⌘K)">
      <span>✦</span><span className="px-jake-fab-label">Ask Jake</span>
    </button>
  );

  return (
    <div className="px-jake-overlay" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <section className="px-jake-panel" aria-label="Ask Jake">
        <div className="px-jake-head">
          <div className="px-jake-mark">✦</div>
          <div className="px-jake-title"><strong>Ask Jake</strong><span>Live command-center intelligence · {module}</span></div>
          <button className="px-icon-button" onClick={() => setOpen(false)} aria-label="Close Jake">×</button>
        </div>

        <div className="px-jake-conversation">
          {messages.length === 0 && (
            <>
              <div>
                <div className="px-brief-label">Useful from here</div>
                <div style={{fontSize:13,color:'var(--px-muted)',lineHeight:1.55}}>Jake reads the live operating context and helps decide what deserves attention, rather than just searching records.</div>
              </div>
              <div className="px-jake-suggestions">
                {suggestions.map((cmd, i) => <button key={i} className="px-jake-suggestion" onClick={() => send(cmd.prompt)}>{cmd.label}</button>)}
              </div>
            </>
          )}

          {messages.map((m, i) => (
            <div key={i}>
              <div className="px-jake-role">{m.role === 'user' ? 'You' : 'Jake'}</div>
              <div className={`px-jake-message px-jake-message--${m.role === 'user' ? 'user' : 'assistant'}`}>{m.content}</div>
            </div>
          ))}

          {loading && <div><div className="px-jake-role">Jake</div><div className="px-jake-message px-jake-message--assistant">Reading the live context…</div></div>}
          <div ref={bottomRef} />
        </div>

        <div className="px-jake-input">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask what matters, what changed, or what to do next…"
            rows={2}
          />
          <button className="px-jake-send" onClick={() => send()} disabled={!input.trim() || loading}>↑</button>
        </div>
        <div className="px-jake-foot">Enter to send · Shift+Enter for a new line · Esc to close</div>
      </section>
    </div>
  );
}
