import { useState, useRef, useEffect } from 'react';
import { askClaude } from '../api/claude';

const QUICK_PROMPTS = {
  dashboard: [
    'What should I focus on today?',
    'What are my biggest risks this week?',
    'Give me a Monday morning priority plan',
  ],
  projects: [
    'Which project needs attention most urgently?',
    'What tasks should I complete this week across all projects?',
    "What's blocking Radar from launching?",
    'Help me plan the Ajura Clothes website sprint',
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
    'What\'s my cash flow projection for Q2 2026?',
    'How much runway do I have at current expense levels?',
    'What revenue gap do I need to fill after 4Africa ends?',
    'Should I prioritize closing 2X Global or find new work?',
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

    const extraContext = context
      ? `User context: ${context}`
      : `Current data snapshot: ${JSON.stringify({
          projectCount: data?.projects?.length,
          activeProjects: data?.projects?.filter(p => p.status === 'Active').length,
          pipelineItems: data?.pipeline?.length,
          upcomingEvents: data?.calendar?.filter(e => !e.done)?.length,
        })}`;

    const reply = await askClaude(newMessages, module, extraContext);

    setMessages([...newMessages, { role: 'assistant', content: reply }]);
    setLoading(false);
  };

  const quickPrompts = QUICK_PROMPTS[module] || QUICK_PROMPTS.dashboard;

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <div className="ai-header-title">
          <span className="ai-dot" />
          AI Assistant
        </div>
        <button className="ai-close" onClick={onClose} aria-label="Close AI panel">✕</button>
      </div>

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            <div className="ai-empty-title">Ask about your {module}</div>
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
            <div className="ai-message-label">{m.role === 'user' ? 'You' : 'Claude'}</div>
            <div className="ai-message-content">{m.content}</div>
          </div>
        ))}

        {loading && (
          <div className="ai-message ai-message--assistant">
            <div className="ai-message-label">Claude</div>
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
          placeholder="Ask anything… (Enter to send)"
          rows={2}
        />
        <button className="ai-send" onClick={() => send()} aria-label="Send">↑</button>
      </div>
    </div>
  );
}
