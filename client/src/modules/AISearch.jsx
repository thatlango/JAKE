import { useState, useRef } from 'react';
import { askClaude } from '../api/claude';

const QUICK = [
  { label: 'Pipeline this week',        q: 'What deals are most urgent in my pipeline right now? Which need attention?' },
  { label: 'Revenue gap analysis',      q: 'What is my current revenue vs target? What is the gap and how do I close it?' },
  { label: 'Overdue tasks',             q: 'Which tasks and projects are behind or at risk?' },
  { label: 'Top 3 priorities',          q: 'Based on my data, what are the 3 most important things I should do today?' },
  { label: 'Client follow-ups',         q: 'Which clients or contacts need follow-up most urgently?' },
  { label: 'Next 30 days',              q: 'What are the most critical events and deadlines in the next 30 days?' },
  { label: 'Cashflow health',           q: 'Analyse my cashflow. How many months of runway do I have? Any concerns?' },
  { label: 'Project progress',          q: 'Give me a project health check — which are on track, which are at risk?' },
];

export default function AISearch({ projects, pipeline, calendar, finance }) {
  const [query,    setQuery]    = useState('');
  const [answer,   setAnswer]   = useState('');
  const [busy,     setBusy]     = useState(false);
  const [history,  setHistory]  = useState([]);
  const inputRef = useRef(null);

  const buildContext = () => {
    const confirmedRev = (finance?.streams||[]).filter(s=>s.status==='Confirmed').reduce((a,s)=>a+s.amount,0);
    const pendingRev   = (finance?.streams||[]).filter(s=>s.status==='Pending').reduce((a,s)=>a+s.amount,0);
    const hotDeals     = (pipeline||[]).filter(p=>['Applied','In Delivery'].includes(p.stage));
    const today        = new Date().toISOString().slice(0,10);
    const upcoming     = [...(calendar||[])].filter(e=>!e.done&&e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,10);

    return `
CURRENT DATA SNAPSHOT (${today}):

PROJECTS (${(projects||[]).length} total):
${(projects||[]).map(p=>{
  const done=(p.tasks||[]).filter(t=>t.done).length;
  const tot=(p.tasks||[]).length;
  const overdue=(p.tasks||[]).filter(t=>!t.done).slice(0,2).map(t=>t.text).join(', ');
  return `• ${p.emoji} ${p.name} [${p.status}] ${p.progress}% complete (${done}/${tot} tasks)${overdue?` — pending: ${overdue}`:''}`;
}).join('\n')}

PIPELINE (${(pipeline||[]).length} deals, ${hotDeals.length} hot):
${(pipeline||[]).map(p=>`• ${p.name} @ ${p.org} — ${p.stage}${p.valueUSD>0?` — $${p.valueUSD.toLocaleString()}`:''}${p.deadline?` — due ${p.deadline}`:''}`).join('\n')}

FINANCE:
• Confirmed revenue: $${confirmedRev.toLocaleString()}
• Pending pipeline: $${pendingRev.toLocaleString()}
• Quarterly target: $${(finance?.targets?.quarterly||20000).toLocaleString()}
• Monthly expenses: $${(finance?.expenses||[]).filter(e=>e.monthly).reduce((a,e)=>a+e.amount,0)}/mo

UPCOMING EVENTS (next 30 days):
${upcoming.map(e=>`• ${e.date}: ${e.title} [${e.project||''}]`).join('\n')}
`.trim();
  };

  const search = async (q = query) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setBusy(true);
    setAnswer('');
    const context = buildContext();
    const result = await askClaude([{
      role: 'user',
      content: `Here is my current business data:\n\n${context}\n\n---\nMy question: ${trimmed}\n\nAnswer directly and specifically using the data above. Use bullet points where helpful. Be concise but complete.`
    }], 'dashboard', context);
    const ans = typeof result === 'string' ? result : 'No answer available.';
    setAnswer(ans);
    setHistory(h => [{ q: trimmed, a: ans, ts: new Date() }, ...h].slice(0, 10));
    setBusy(false);
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !busy) { e.preventDefault(); search(); }
  };

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">AI Search</h1>
          <p className="module-sub">Ask anything about your business — searches all your data</p>
        </div>
      </div>

      <div className="module-body">
        {/* Search bar */}
        <div style={{ position:'relative', marginBottom:16 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask anything… e.g. 'Which deals need attention this week?'"
            style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border-strong)', borderRadius:12, padding:'14px 52px 14px 16px', color:'var(--text)', fontSize:15, outline:'none', transition:'border-color .15s' }}
            onFocus={e => e.target.style.borderColor='var(--accent)'}
            onBlur={e  => e.target.style.borderColor='var(--border-strong)'}
          />
          <button onClick={() => search()} disabled={busy || !query.trim()}
            style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', background: busy||!query.trim()?'var(--surface-3)':'var(--accent)', color: busy||!query.trim()?'var(--text-muted)':'#07090F', border:'none', borderRadius:8, fontSize:16, cursor: busy||!query.trim()?'not-allowed':'pointer' }}>
            {busy ? '…' : '↵'}
          </button>
        </div>

        {/* Quick prompts */}
        {!answer && !busy && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:10, fontWeight:600 }}>Quick Questions</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {QUICK.map(q => (
                <button key={q.label} onClick={() => { setQuery(q.q); search(q.q); }}
                  style={{ padding:'7px 14px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:999, fontSize:12, color:'var(--text-muted)', cursor:'pointer', transition:'all .15s' }}
                  onMouseEnter={e=>{e.target.style.borderColor='var(--accent)';e.target.style.color='var(--accent)';}}
                  onMouseLeave={e=>{e.target.style.borderColor='var(--border)';e.target.style.color='var(--text-muted)';}}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {busy && (
          <div style={{ padding:'24px 0', textAlign:'center', color:'var(--blue)' }}>
            <div style={{ fontSize:24, marginBottom:8 }}>✦</div>
            <div style={{ fontSize:13, fontWeight:600 }}>Searching your data…</div>
          </div>
        )}

        {/* Answer */}
        {answer && (
          <div className="card" style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12, alignItems:'flex-start', gap:8 }}>
              <div style={{ fontSize:12, color:'var(--text-muted)', fontStyle:'italic', flex:1 }}>"{query}"</div>
              <button onClick={() => { setAnswer(''); setQuery(''); }} style={{ fontSize:11, color:'var(--text-dim)', background:'none', border:'none', cursor:'pointer', flexShrink:0 }}>✕ Clear</button>
            </div>
            <div style={{ fontSize:13.5, color:'var(--text)', lineHeight:1.8, whiteSpace:'pre-wrap' }}>{answer}</div>
            <div style={{ marginTop:12, display:'flex', gap:6 }}>
              <button onClick={() => navigator.clipboard.writeText(answer)}
                style={{ padding:'5px 12px', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
                Copy
              </button>
              <button onClick={() => search()}
                style={{ padding:'5px 12px', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div>
            <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:10, fontWeight:600 }}>Recent Searches</div>
            {history.map((h, i) => (
              <div key={i} style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:4 }}
                  onClick={() => { setQuery(h.q); setAnswer(h.a); }}>
                  <span style={{ fontSize:11, color:'var(--blue)' }}>↺</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{h.q}</span>
                  <span style={{ fontSize:10, color:'var(--text-dim)', marginLeft:'auto', fontFamily:'JetBrains Mono,monospace' }}>
                    {h.ts.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
                  </span>
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.6, paddingLeft:19 }}
                  dangerouslySetInnerHTML={{ __html: h.a.slice(0,200).replace(/\n/g,'<br>') + (h.a.length>200?'…':'') }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
