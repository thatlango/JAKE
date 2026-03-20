export default function Dashboard({ projects, pipeline, calendar, finance, openAI }) {
  const today = new Date();

  const activeProjects = projects.filter(p => ['Active', 'In Development'].includes(p.status));
  const confirmedRevenue = finance.streams
    .filter(s => s.status === 'Confirmed')
    .reduce((sum, s) => sum + s.amount, 0);
  const pendingRevenue = finance.streams
    .filter(s => s.status === 'Pending')
    .reduce((sum, s) => sum + s.amount, 0);

  const upcomingEvents = [...calendar]
    .filter(e => !e.done && new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 6);

  const hotDeals = pipeline.filter(p =>
    ['Applied', 'In Delivery'].includes(p.stage)
  );

  const criticalTasks = projects
    .flatMap(p => p.tasks.filter(t => !t.done).map(t => ({ ...t, project: p.name, emoji: p.emoji })))
    .slice(0, 6);

  const TYPE_COLORS = { milestone: '#F0B429', session: '#5E6AD2', deadline: '#FF4757' };

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Good morning, Jacob.</h1>
          <p className="module-sub">Tuku-Tuku Labs · Northern Uganda</p>
        </div>
        <button className="ai-trigger" onClick={() => openAI('Dashboard overview — give a prioritised briefing')}>
          ✦ Ask AI
        </button>
      </div>

      {/* Stats */}
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

      {/* 3-col grid */}
      <div className="dashboard-grid">
        {/* Projects */}
        <div className="card">
          <div className="card-header">Projects</div>
          <div className="project-list">
            {projects.map(p => (
              <div key={p.id} className="project-row">
                <span className="project-emoji">{p.emoji}</span>
                <div className="project-row-info">
                  <div className="project-row-name">{p.name}</div>
                  <div className="progress-bar" style={{ marginTop: 4 }}>
                    <div
                      className="progress-fill"
                      style={{ width: `${p.progress}%`, background: p.color }}
                    />
                  </div>
                </div>
                <span className={`badge badge--${p.status.toLowerCase().replace(/ /g, '-')}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div className="card">
          <div className="card-header">Next Up</div>
          <div className="event-list">
            {upcomingEvents.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No upcoming events</div>
            )}
            {upcomingEvents.map(e => (
              <div key={e.id} className="event-row">
                <div
                  className="event-type"
                  style={{ background: TYPE_COLORS[e.type] || '#5A6480' }}
                />
                <div className="event-info">
                  <div className="event-title">{e.title}</div>
                  <div className="event-meta">
                    {e.project} ·{' '}
                    {new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline spotlight */}
        <div className="card">
          <div className="card-header">Pipeline Spotlight</div>
          {hotDeals.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No active deals</div>
          )}
          {hotDeals.map(d => (
            <div key={d.id} className="pipeline-row">
              <div className="pipeline-org">{d.org}</div>
              <div className="pipeline-name">{d.name}</div>
              <div className="pipeline-meta">
                <span className="badge">{d.stage}</span>
                {d.valueUSD > 0 && (
                  <span className="pipeline-value">${d.valueUSD.toLocaleString()}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
