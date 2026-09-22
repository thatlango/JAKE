import { useState, useRef, useEffect } from 'react';
import { askClaude } from '../api/claude';

const QUICK_PROMPTS = {
  dashboard: [
    'What are the three decisions only I should make now?',
    'What must finish before I start anything else?',
    'What should move to market this week, and what should I park?',
    'What can I delegate immediately?',
  ],
  projects: [
    'Which active project is closest to a verified outcome?',
    'Where is WIP too high or completion stalled?',
    'Which project should be parked or narrowed?',
    'Which delivery needs an executive decision from me?',
  ],
  pipeline: [
    'What\'s the best follow-up move for the 2X Global deal?',
    'How do I strengthen my relationship with Palladium?',
    'What\'s my total confirmed + pending pipeline value?',
    'Draft a short follow-up email for 2X Global',
  ],
  calendar: [
    'Am I on track for the 4Africa program?',
    'What deliverables are due in the next 2 weeks?',
    'How do I prepare for the Gulu Digital Literacy workshop?',
    'What happens if the Excel workbook is delayed?',
  ],
  finance: [
    'What cash needs collecting or protecting first?',
    'Where is the revenue gap against the current plan?',
    'Which market action has the strongest near-term cash effect?',
    'What spending or work should I stop if cash tightens?',
  ]
};

export default function AIPanel({ context, module, onClose, data }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');

    const newMessages = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    setLoading(true);

    let live={};
    try{
      const [overviewR,todayR,opportunitiesR]=await Promise.all([
        fetch('/api/overview'),
        fetch('/api/work/today?limit=12'),
        fetch('/api/opportunities?limit=80')
      ]);
      const [overview,today,opportunities]=await Promise.all([
        overviewR.ok?overviewR.json():{},
        todayR.ok?todayR.json():{},
        opportunitiesR.ok?opportunitiesR.json():{}
      ]);
      live={
        tasks:overview.tasks,
        pipeline:overview.pipeline,
        invoices:overview.invoices,
        finance:overview.finance,
        attentionSignals:(overview.attention_signals||[]).slice(0,8),
        rankedWork:(today.priorities||[]).slice(0,12),
        opportunitySummary:opportunities.summary,
        activeOpportunities:(opportunities.opportunities||[]).filter(o=>!['Won','Lost','Closed'].includes(o.stage)).slice(0,15)
      };
    }catch{}
    const extraContext=[
      context?`User context: ${context}`:'',
      `Current executive operating snapshot: ${JSON.stringify(live)}`
    ].filter(Boolean).join('\n\n');

    const reply = await askClaude(newMessages, module, extraContext);

    setMessages([...newMessages, { role: 'assistant', content: reply }]);
    setLoading(false);
  };

  const quickPrompts = QUICK_PROMPTS[module] || QUICK_PROMPTS.dashboard;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-header-title">
          <img className="tuku-ai-icon tuku-ai-icon--header" src="/brand/tuku-ai.svg" alt="" aria-hidden="true" />
          <span>Ask Jake</span>
        </div>
        <button className="ai-close" onClick={onClose} aria-label="Close AI panel">✕</button>
      </div>

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            <div className="ai-empty-title">Use Jake for decisions, closure and market movement</div>
            <div className="ai-quick-prompts">
              {quickPrompts.map((p, i) => (
                <button key={i} className="quick-prompt" onClick={() => send(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`ai-message ai-message--${m.role}`}>
            <div className="ai-message-label">
              {m.role === 'user' ? 'You' : <><img className="tuku-ai-icon tuku-ai-icon--label" src="/brand/tuku-ai.svg" alt="" aria-hidden="true" />Jake</>}
            </div>
            <div className="ai-message-content">{m.content}</div>
          </div>
        ))}

        {loading && (
          <div className="ai-message ai-message--assistant">
            <div className="ai-message-label"><img className="tuku-ai-icon tuku-ai-icon--label" src="/brand/tuku-ai.svg" alt="" aria-hidden="true" />Jake</div>
            <div className="ai-loading">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="ai-input-area">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask what to decide, finish, move, delegate or park…"
          rows={2}
        />
        <button className="ai-send" onClick={() => send()} aria-label="Send">↑</button>
      </div>
    </div>
  );
}
