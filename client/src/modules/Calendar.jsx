import { useState, useEffect } from 'react';

const TYPE_COLORS = {
  milestone: '#F0B429',
  session:   '#5E6AD2',
  deadline:  '#FF4757',
  gcal:      '#0ECB81',
};

const GCAL_COLOR_MAP = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
  '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#616161',
  '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
};

export default function Calendar({ calendar, setCalendar, openAI }) {
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('all');      // 'all' | 'jake' | 'google'
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalStatus, setGcalStatus] = useState({ connected: false, configured: false, email: null });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const today = new Date();

  // Load GCal status + events on mount
  useEffect(() => {
    fetchGcalStatus();
    fetchGcalEvents();
  }, []);

  const fetchGcalStatus = async () => {
    try {
      const res = await fetch('/api/gcal/status');
      const data = await res.json();
      setGcalStatus(data);
    } catch {}
  };

  const fetchGcalEvents = async () => {
    try {
      const res = await fetch('/api/gcal/events');
      const data = await res.json();
      if (data.events) setGcalEvents(data.events);
      if (data.connected !== undefined) setGcalStatus(s => ({ ...s, connected: data.connected, email: data.email || s.email }));
    } catch {}
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/gcal/sync', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setGcalEvents(data.events || []);
        setSyncMsg(`✓ ${data.count} events synced`);
      } else {
        setSyncMsg(`✗ ${data.error}`);
      }
    } catch (e) {
      setSyncMsg(`✗ ${e.message}`);
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 3000);
  };

  const disconnect = async () => {
    await fetch('/api/gcal/disconnect', { method: 'POST' });
    setGcalEvents([]);
    setGcalStatus(s => ({ ...s, connected: false, email: null }));
  };

  // Merge JAKE + GCal events for display
  const allEvents = [
    ...calendar.map(e => ({ ...e, source: 'jake' })),
    ...gcalEvents.map(e => ({ ...e, source: 'google' })),
  ];

  const getDisplayEvents = () => {
    let events = tab === 'jake'   ? calendar.map(e => ({ ...e, source: 'jake' }))
               : tab === 'google' ? gcalEvents
               : allEvents;

    if (filter !== 'all') events = events.filter(e => e.type === filter);
    return events.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const sorted = getDisplayEvents();
  const upcoming = sorted.filter(e => !e.done && new Date(e.date) >= today);
  const pastOrDone = sorted.filter(e => e.done || new Date(e.date) < today);

  const toggle = id => {
    setCalendar(prev => prev.map(e => e.id === id ? { ...e, done: !e.done } : e));
  };

  const formatDate = date =>
    new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const daysUntil = date => {
    const diff = Math.ceil((new Date(date) - today) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    return `in ${diff}d`;
  };

  const getEventColor = (e) => {
    if (e.source === 'google') return e.calendarColor || GCAL_COLOR_MAP[e.colorId] || '#0ECB81';
    return TYPE_COLORS[e.type] || '#5A6480';
  };

  const gcalCount = gcalEvents.length;
  const jakeCount = calendar.filter(e => !e.done && new Date(e.date) >= today).length;

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Calendar</h1>
          <p className="module-sub">
            {jakeCount} JAKE events
            {gcalStatus.connected && ` · ${gcalCount} from Google`}
            {gcalStatus.email && (
              <span style={{ color: 'var(--green)', marginLeft: 6 }}>
                ● {gcalStatus.email}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {gcalStatus.connected && (
            <button
              className="ai-trigger-sm"
              onClick={syncNow}
              disabled={syncing}
              style={{ minWidth: 80 }}
            >
              {syncing ? '⟳ Syncing…' : '↻ Sync GCal'}
            </button>
          )}
          <button
            className="ai-trigger"
            onClick={() => openAI(
              `Calendar: ${jakeCount} JAKE events${gcalStatus.connected ? `, ${gcalCount} Google events` : ''}. Upcoming: ${upcoming.slice(0,5).map(e=>e.title).join(', ')}`
            )}
          >
            ✦ Ask AI
          </button>
        </div>
      </div>

      {/* Sync status message */}
      {syncMsg && (
        <div style={{
          padding: '6px 28px',
          fontSize: 12,
          color: syncMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)',
          borderBottom: '1px solid var(--border)',
        }}>
          {syncMsg}
        </div>
      )}

      {/* Google Calendar connect banner — shows when not connected */}
      {!gcalStatus.connected && (
        <div style={{
          margin: '0 28px 0',
          background: 'var(--surface-2)',
          border: '1px solid rgba(14,203,129,0.2)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Connect Google Calendar
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {gcalStatus.configured
                ? 'Credentials found — click Connect to authorise'
                : 'Add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to Replit Secrets first'}
            </div>
          </div>
          {gcalStatus.configured ? (
            <a
              href="/auth/google"
              style={{
                background: 'var(--green)',
                color: '#07090F',
                fontWeight: 700,
                fontSize: 12,
                padding: '8px 16px',
                borderRadius: 6,
                textDecoration: 'none',
                fontFamily: 'Syne, sans-serif',
                flexShrink: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Connect →
            </a>
          ) : (
            <a
              href="/?module=integrations"
              style={{
                background: 'var(--accent)',
                color: '#07090F',
                fontWeight: 700,
                fontSize: 12,
                padding: '8px 16px',
                borderRadius: 6,
                textDecoration: 'none',
                fontFamily: 'Syne, sans-serif',
                flexShrink: 0,
              }}
            >
              Set Up →
            </a>
          )}
        </div>
      )}

      {/* Source tabs */}
      <div className="filter-bar" style={{ justifyContent: 'space-between', marginTop: gcalStatus.connected ? 0 : 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`filter-btn ${tab === 'all' ? 'filter-btn--active' : ''}`} onClick={() => setTab('all')}>
            All ({allEvents.filter(e => !e.done && new Date(e.date) >= today).length})
          </button>
          <button className={`filter-btn ${tab === 'jake' ? 'filter-btn--active' : ''}`} onClick={() => setTab('jake')}>
            JAKE ({jakeCount})
          </button>
          {gcalStatus.connected && (
            <button className={`filter-btn ${tab === 'google' ? 'filter-btn--active' : ''}`} onClick={() => setTab('google')}>
              📅 Google ({gcalCount})
            </button>
          )}
          {/* Type filter */}
          {['milestone', 'session', 'deadline'].map(f => (
            <button key={f} className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`} onClick={() => setFilter(filter === f ? 'all' : f)}>
              {f}
            </button>
          ))}
        </div>
        {gcalStatus.connected && (
          <button
            className="ai-trigger-sm"
            onClick={disconnect}
            style={{ color: 'var(--red)', borderColor: 'rgba(255,71,87,0.2)', background: 'var(--red-dim)', fontSize: 10 }}
          >
            Disconnect GCal
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="calendar-timeline">
        {upcoming.length > 0 && (
          <>
            <div className="timeline-section-label">Upcoming</div>
            {upcoming.map(e => (
              <div
                key={e.id}
                className="timeline-item"
                style={{ '--type-color': getEventColor(e) }}
              >
                <div className="timeline-date">{formatDate(e.date)}</div>
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {e.source === 'google' && <span style={{ fontSize: 10 }}>📅</span>}
                    {e.title}
                    {e.gcalLink && (
                      <a href={e.gcalLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', fontSize: 10, marginLeft: 2 }}>↗</a>
                    )}
                  </div>
                  <div className="timeline-meta">
                    <span>{e.project || e.calendarName || 'Google Calendar'}</span>
                    {e.source === 'jake' && (
                      <> · <span style={{ color: TYPE_COLORS[e.type] }}>{e.type}</span></>
                    )}
                    {' · '}
                    <span style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      color: daysUntil(e.date) === 'Today' ? 'var(--red)'
                           : daysUntil(e.date).includes('ago') ? 'var(--red)'
                           : 'var(--text-muted)',
                    }}>
                      {daysUntil(e.date)}
                    </span>
                    {e.location && (
                      <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>📍 {e.location.slice(0, 30)}</span>
                    )}
                  </div>
                </div>
                {e.source === 'jake' ? (
                  <button className="timeline-check" onClick={() => toggle(e.id)} title="Mark done">✓</button>
                ) : (
                  <span style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 14 }}>📅</span>
                )}
              </div>
            ))}
          </>
        )}

        {pastOrDone.length > 0 && (
          <>
            <div className="timeline-section-label timeline-section-label--muted">Completed / Past</div>
            {pastOrDone.slice(-8).map(e => (
              <div
                key={e.id}
                className="timeline-item timeline-item--done"
                style={{ '--type-color': '#2A3050' }}
              >
                <div className="timeline-date">{formatDate(e.date)}</div>
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-title">{e.title}</div>
                  <div className="timeline-meta">{e.project || e.calendarName}</div>
                </div>
                {e.source === 'jake' && (
                  <button className="timeline-check timeline-check--done" onClick={() => toggle(e.id)} title="Mark undone">↩</button>
                )}
              </div>
            ))}
          </>
        )}

        {upcoming.length === 0 && pastOrDone.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
            No events found.
          </div>
        )}
      </div>
    </div>
  );
}
