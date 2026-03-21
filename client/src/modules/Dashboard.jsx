import { useState, useEffect } from 'react';

function HealthScore({ projects, pipeline, finance }) {
  const allTasks     = (projects||[]).flatMap(p => p.tasks||[]);
  const doneTasks    = allTasks.filter(t => t.done).length;
  const delivery     = allTasks.length > 0 ? Math.round((doneTasks / allTasks.length) * 100) : 50;

  const confirmed    = (finance?.streams||[]).filter(s=>s.status==='Confirmed').reduce((a,s)=>a+s.amount,0);
  const target       = finance?.targets?.quarterly || 20000;
  const revenue      = Math.min(100, Math.round((confirmed / target) * 100));

  const hotDeals     = (pipeline||[]).filter(p=>['Applied','In Delivery','Active Partner'].includes(p.stage));
  const pipeVelocity = (pipeline||[]).length > 0 ? Math.round((hotDeals.length / (pipeline||[]).length) * 100) : 50;

  const overall = Math.round((delivery * 0.35) + (revenue * 0.4) + (pipeVelocity * 0.25));

  const color = overall >= 70 ? 'var(--green)' : overall >= 40 ? 'var(--accent)' : 'var(--red)';
  const label = overall >= 70 ? 'Strong' : overall >= 40 ? 'Building' : 'Needs Work';

  const bars = [
    { label:'Revenue vs Target', val:revenue,      color:'var(--green)' },
    { label:'Project Delivery',  val:delivery,     color:'var(--blue)'  },
    { label:'Pipeline Activity', val:pipeVelocity, color:'var(--accent)'},
  ];

  return (
    <div className="card health-score-card">
      <div className="card-header">Business Health</div>
      <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:14 }}>
        <div style={{ position:'relative', width:64, height:64, flexShrink:0 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" fill="none" stroke="var(--surface-3)" strokeWidth="6"/>
            <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6"
              strokeDasharray={`${(overall/100)*163.4} 163.4`}
              strokeLinecap="round" transform="rotate(-90 32 32)"
              style={{ transition:'stroke-dasharray .6s ease' }}/>
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:16, color, lineHeight:1 }}>{overall}</span>
          </div>
        </div>
        <div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:17, color, lineHeight:1 }}>{label}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>Overall score</div>
        </div>
      </div>
      {bars.map(b => (
        <div key={b.label} style={{ marginBottom:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>
            <span>{b.label}</span><span style={{ color:b.color, fontWeight:700 }}>{b.val}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width:`${b.val}%`, background:b.color }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function FXRates() {
  const [rates, setRates] = useState(null);
  const [updated, setUpdated] = useState('');

  useEffect(() => {
    const cached = localStorage.getItem('jake_fx_cache');
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < 3600000) { setRates(data.rates); setUpdated(data.updated); return; }
      } catch {}
    }
    fetch('/api/fx-rates')
      .then(r => r.json())
      .then(d => {
        setRates(d.rates);
        setUpdated(d.updated);
        localStorage.setItem('jake_fx_cache', JSON.stringify({ data: d, ts: Date.now() }));
      })
      .catch(() => {});
  }, []);

  if (!rates) return null;
  const pairs = [['UGX',1], ['KES',1], ['EUR',4], ['GBP',4]];

  return (
    <div className="card">
      <div className="card-header">USD Exchange Rates {updated && <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:9, marginLeft:4 }}>({new Date(updated).toLocaleDateString('en-GB',{day:'numeric',month:'short'})})</span>}</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        {pairs.map(([cur, dp]) => rates[cur] && (
          <div key={cur} style={{ background:'var(--surface-3)', borderRadius:6, padding:'8px 10px' }}>
            <div style={{ fontFamily:'JetBrains Mono,monospace', fontSize:13, fontWeight:700, color:'var(--text)' }}>
              {rates[cur].toFixed(dp).toLocaleString()}
            </div>
            <div style={{ fontSize:10, color:'var(--text-muted)' }}>1 USD = {cur}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ projects, pipeline, calendar, finance, openAI }) {
  const today = new Date();

  const activeProjects  = (projects||[]).filter(p => ['Active', 'In Development'].includes(p.status));
  const confirmedRevenue = (finance?.streams||[]).filter(s => s.status === 'Confirmed').reduce((sum, s) => sum + s.amount, 0);
  const pendingRevenue   = (finance?.streams||[]).filter(s => s.status === 'Pending').reduce((sum, s) => sum + s.amount, 0);

  const upcomingEvents = [...(calendar||[])]
    .filter(e => !e.done && new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6);

  const hotDeals = (pipeline||[]).filter(p => ['Applied', 'In Delivery'].includes(p.stage));
  const TYPE_COLORS = { milestone: '#F0B429', session: '#5E6AD2', deadline: '#FF4757' };

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Good morning, Jacob.</h1>
          <p className="module-sub">Tuku-Tuku Labs · Northern Uganda</p>
        </div>
        <button className="ai-trigger" onClick={() => openAI('Dashboard overview — give a prioritised briefing for today')}>
          ✦ Ask AI
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{activeProjects.length}</div>
          <div className="stat-label">Active Projects</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-value">${confirmedRevenue.toLocaleString()}</div>
          <div className="stat-label">Confirmed Revenue</div>
        </div>
        <div className="stat-card stat-card--amber">
          <div className="stat-value">${pendingRevenue.toLocaleString()}</div>
          <div className="stat-label">Pending Pipeline</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{upcomingEvents.length}</div>
          <div className="stat-label">Upcoming Events</div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Projects */}
        <div className="card">
          <div className="card-header">Projects</div>
          <div className="project-list">
            {(projects||[]).map(p => (
              <div key={p.id} className="project-row">
                <span className="project-emoji">{p.emoji}</span>
                <div className="project-row-info">
                  <div className="project-row-name">{p.name}</div>
                  <div className="progress-bar" style={{ marginTop:4 }}>
                    <div className="progress-fill" style={{ width:`${p.progress}%`, background:p.color }}/>
                  </div>
                </div>
                <span className={`badge badge--${p.status.toLowerCase().replace(/ /g,'-')}`}>{p.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div className="card">
          <div className="card-header">Next Up</div>
          <div className="event-list">
            {upcomingEvents.length === 0 && <div style={{ color:'var(--text-muted)', fontSize:12 }}>No upcoming events</div>}
            {upcomingEvents.map(e => (
              <div key={e.id} className="event-row">
                <div className="event-type" style={{ background:TYPE_COLORS[e.type]||'#5A6480' }}/>
                <div className="event-info">
                  <div className="event-title">{e.title}</div>
                  <div className="event-meta">{e.project} · {new Date(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline spotlight */}
        <div className="card">
          <div className="card-header">Pipeline Spotlight</div>
          {hotDeals.length === 0 && <div style={{ color:'var(--text-muted)', fontSize:12 }}>No active deals</div>}
          {hotDeals.map(d => (
            <div key={d.id} className="pipeline-row">
              <div className="pipeline-org">{d.org}</div>
              <div className="pipeline-name">{d.name}</div>
              <div className="pipeline-meta">
                <span className="badge">{d.stage}</span>
                {d.valueUSD > 0 && <span className="pipeline-value">${d.valueUSD.toLocaleString()}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Business Health Score */}
        <HealthScore projects={projects} pipeline={pipeline} finance={finance} />

        {/* FX Rates */}
        <FXRates />
      </div>
    </div>
  );
}
