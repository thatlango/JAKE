import { useState, useEffect } from 'react';

const TYPE_COLORS = {
  milestone: '#F0B429',
  session:   '#5E6AD2',
  deadline:  '#FF4757',
  meeting:   '#9F7AEA',
  other:     '#5A6480',
  gcal:      '#0ECB81',
};

const GCAL_COLOR_MAP = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
  '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#616161',
  '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
};

const EVENT_TYPES = ['milestone', 'session', 'deadline', 'meeting', 'other'];
const DEFAULT_EVENT = { title: '', date: new Date().toISOString().slice(0, 10), time: '', project: '', type: 'session', notes: '' };

// ── Month grid helpers ──
function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MonthView({ events, calendar, onToggle, selectedDay, onSelectDay }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const cells = getMonthGrid(viewYear, viewMonth);
  const monthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const eventsOnDay = (day) => {
    if (!day) return [];
    const ds = `${monthStr}-${String(day).padStart(2, '0')}`;
    return events.filter(e => e.date && e.date.startsWith(ds));
  };

  const isToday = (day) => {
    return day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  };

  const navigate = (dir) => {
    let m = viewMonth + dir;
    let y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  return (
    <div style={{ padding: '0 28px 20px' }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{monthLabel}</span>
        <button onClick={() => navigate(1)} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text)', cursor: 'pointer', fontSize: 14 }}>›</button>
        <button onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
          style={{ background: 'var(--accent-dim)', border: '1px solid rgba(240,180,41,.2)', borderRadius: 6, padding: '5px 10px', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Today</button>
      </div>

      {/* DOW headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
        {DOW.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          const dayEvents = eventsOnDay(day);
          const ds = day ? `${monthStr}-${String(day).padStart(2, '0')}` : null;
          const isSelected = selectedDay === ds;
          return (
            <div
              key={i}
              onClick={() => day && onSelectDay(isSelected ? null : ds)}
              style={{
                minHeight: 56,
                background: isSelected ? 'var(--accent-dim)' : isToday(day) ? 'rgba(240,180,41,.08)' : day ? 'var(--surface-2)' : 'transparent',
                border: isSelected ? '1px solid var(--accent)' : isToday(day) ? '1px solid rgba(240,180,41,.3)' : '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 5px',
                cursor: day ? 'pointer' : 'default',
                transition: 'background .15s',
              }}
            >
              {day && (
                <>
                  <div style={{ fontSize: 11, fontWeight: isToday(day) ? 700 : 400, color: isToday(day) ? 'var(--accent)' : 'var(--text-muted)', marginBottom: 3 }}>{day}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {dayEvents.slice(0, 4).map(e => (
                      <div key={e.id} title={e.title} style={{
                        width: '100%', height: 5, borderRadius: 2, maxWidth: '100%',
                        background: e.source === 'google'
                          ? (e.calendarColor || GCAL_COLOR_MAP[e.colorId] || '#0ECB81')
                          : (TYPE_COLORS[e.type] || '#5A6480'),
                      }} />
                    ))}
                    {dayEvents.length > 4 && <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>+{dayEvents.length - 4}</div>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected day events */}
      {selectedDay && eventsOnDay(parseInt(selectedDay.slice(-2), 10)).length > 0 && (
        <div style={{ marginTop: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {new Date(selectedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {eventsOnDay(parseInt(selectedDay.slice(-2), 10)).map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: e.source === 'google' ? (e.calendarColor || '#0ECB81') : (TYPE_COLORS[e.type] || '#5A6480'), flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{e.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.project || e.calendarName}</div>
              </div>
              {e.source === 'jake' && (
                <button onClick={() => onToggle(e.id)} style={{ background: 'none', border: 'none', color: e.done ? 'var(--green)' : 'var(--text-dim)', fontSize: 14, cursor: 'pointer' }}>
                  {e.done ? '✓' : '○'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Calendar({ calendar, setCalendar, openAI }) {
  const [view, setView] = useState('upcoming');  // 'upcoming' | 'month'
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('all');
  const [gcalEvents, setGcalEvents] = useState([]);
  const [gcalStatus, setGcalStatus] = useState({ connected: false, configured: false, email: null });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newEvent, setNewEvent] = useState(DEFAULT_EVENT);
  const [selectedDay, setSelectedDay] = useState(null);
  const today = new Date();

  useEffect(() => {
    fetchGcalStatus();
    fetchGcalEvents();
  }, []);

  const fetchGcalStatus = async () => {
    try { const res = await fetch('/api/gcal/status'); setGcalStatus(await res.json()); } catch {}
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
    setSyncing(true); setSyncMsg('');
    try {
      const res = await fetch('/api/gcal/sync', { method: 'POST' });
      const data = await res.json();
      if (data.ok) { setGcalEvents(data.events || []); setSyncMsg(`✓ ${data.count} events synced`); }
      else setSyncMsg(`✗ ${data.error}`);
    } catch (e) { setSyncMsg(`✗ ${e.message}`); }
    setSyncing(false);
    setTimeout(() => setSyncMsg(''), 3000);
  };

  const disconnect = async () => {
    await fetch('/api/gcal/disconnect', { method: 'POST' });
    setGcalEvents([]);
    setGcalStatus(s => ({ ...s, connected: false, email: null }));
  };

  const allEvents = [
    ...calendar.map(e => ({ ...e, source: 'jake' })),
    ...gcalEvents.map(e => ({ ...e, source: 'google' })),
  ];

  const getDisplayEvents = () => {
    let events = tab === 'jake' ? calendar.map(e => ({ ...e, source: 'jake' }))
      : tab === 'google' ? gcalEvents
      : allEvents;
    if (filter !== 'all') events = events.filter(e => e.type === filter);
    return events.sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const sorted = getDisplayEvents();
  const upcoming = sorted.filter(e => !e.done && new Date(e.date) >= today);
  const pastOrDone = sorted.filter(e => e.done || new Date(e.date) < today);

  const toggle = id => setCalendar(prev => prev.map(e => e.id === id ? { ...e, done: !e.done } : e));

  const addEvent = () => {
    if (!newEvent.title.trim() || !newEvent.date) return;
    const id = `ev_${Date.now()}`;
    const event = { id, ...newEvent, done: false, source: 'jake' };
    setCalendar(prev => [...prev, event]);
    setNewEvent(DEFAULT_EVENT);
    setShowAdd(false);
  };

  const deleteEvent = (id) => setCalendar(prev => prev.filter(e => e.id !== id));

  const formatDate = date => new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const daysUntil = date => {
    const diff = Math.ceil((new Date(date) - today) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    return `in ${diff}d`;
  };
  const getEventColor = e =>
    e.source === 'google' ? (e.calendarColor || GCAL_COLOR_MAP[e.colorId] || '#0ECB81')
      : (TYPE_COLORS[e.type] || '#5A6480');

  const gcalCount = gcalEvents.length;
  const jakeCount = calendar.filter(e => !e.done && new Date(e.date) >= today).length;
  const setN = (k, v) => setNewEvent(f => ({ ...f, [k]: v }));

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Calendar</h1>
          <p className="module-sub">
            {jakeCount} JAKE events
            {gcalStatus.connected && ` · ${gcalCount} from Google`}
            {gcalStatus.email && <span style={{ color: 'var(--green)', marginLeft: 6 }}>● {gcalStatus.email}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="ai-trigger-sm" onClick={() => setShowAdd(s => !s)}>+ Add Event</button>
          {gcalStatus.connected && (
            <button className="ai-trigger-sm" onClick={syncNow} disabled={syncing} style={{ minWidth: 80 }}>
              {syncing ? '⟳ Syncing…' : '↻ GCal'}
            </button>
          )}
          <button className="ai-trigger" onClick={() => openAI(`Calendar: ${jakeCount} events. Upcoming: ${upcoming.slice(0, 5).map(e => e.title).join(', ')}`)}>✦ Ask AI</button>
        </div>
      </div>

      {syncMsg && (
        <div style={{ padding: '6px 28px', fontSize: 12, color: syncMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)', borderBottom: '1px solid var(--border)' }}>
          {syncMsg}
        </div>
      )}

      {/* Add event form */}
      {showAdd && (
        <div style={{ margin: '0 28px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>New Event</div>
          <input value={newEvent.title} onChange={e => setN('title', e.target.value)} placeholder="Event title *"
            style={{ width: '100%', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, marginBottom: 8 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input type="date" value={newEvent.date} onChange={e => setN('date', e.target.value)}
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            <input type="time" value={newEvent.time} onChange={e => setN('time', e.target.value)}
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            <input value={newEvent.project} onChange={e => setN('project', e.target.value)} placeholder="Project / label"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            <select value={newEvent.type} onChange={e => setN('type', e.target.value)}
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }}>
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <textarea value={newEvent.notes} onChange={e => setN('notes', e.target.value)} placeholder="Notes…"
            style={{ width: '100%', marginTop: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, minHeight: 50, resize: 'vertical', fontFamily: 'DM Sans, sans-serif' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={addEvent} style={{ flex: 1, padding: '9px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne,sans-serif' }}>Save Event</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '9px 14px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* GCal connect banner */}
      {!gcalStatus.connected && (
        <div style={{ margin: '0 28px 0', background: 'var(--surface-2)', border: '1px solid rgba(14,203,129,0.2)', borderRadius: 'var(--radius)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Connect Google Calendar</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {gcalStatus.configured ? 'Credentials found — click Connect to authorise' : 'Add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to Netlify env vars'}
            </div>
          </div>
          {gcalStatus.configured ? (
            <a href="/auth/google" style={{ background: 'var(--green)', color: '#07090F', fontWeight: 700, fontSize: 12, padding: '8px 16px', borderRadius: 6, textDecoration: 'none', fontFamily: 'Syne, sans-serif' }}>Connect →</a>
          ) : (
            <a href="/?module=integrations" style={{ background: 'var(--accent)', color: '#07090F', fontWeight: 700, fontSize: 12, padding: '8px 16px', borderRadius: 6, textDecoration: 'none', fontFamily: 'Syne, sans-serif' }}>Set Up →</a>
          )}
        </div>
      )}

      {/* View tabs + filters */}
      <div className="filter-bar" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button className={`filter-btn ${view === 'upcoming' ? 'filter-btn--active' : ''}`} onClick={() => setView('upcoming')}>⋮ Timeline</button>
          <button className={`filter-btn ${view === 'month' ? 'filter-btn--active' : ''}`} onClick={() => setView('month')}>▦ Month</button>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
          <button className={`filter-btn ${tab === 'all' ? 'filter-btn--active' : ''}`} onClick={() => setTab('all')}>All ({allEvents.filter(e => !e.done && new Date(e.date) >= today).length})</button>
          <button className={`filter-btn ${tab === 'jake' ? 'filter-btn--active' : ''}`} onClick={() => setTab('jake')}>JAKE ({jakeCount})</button>
          {gcalStatus.connected && <button className={`filter-btn ${tab === 'google' ? 'filter-btn--active' : ''}`} onClick={() => setTab('google')}>📅 Google ({gcalCount})</button>}
          {EVENT_TYPES.slice(0, 3).map(f => (
            <button key={f} className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`} onClick={() => setFilter(filter === f ? 'all' : f)}>{f}</button>
          ))}
        </div>
        {gcalStatus.connected && (
          <button className="ai-trigger-sm" onClick={disconnect} style={{ color: 'var(--red)', borderColor: 'rgba(255,71,87,0.2)', background: 'var(--red-dim)', fontSize: 10 }}>Disconnect GCal</button>
        )}
      </div>

      {/* Month view */}
      {view === 'month' && (
        <MonthView
          events={getDisplayEvents()}
          calendar={calendar}
          onToggle={toggle}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}

      {/* Timeline view */}
      {view === 'upcoming' && (
        <div className="calendar-timeline">
          {upcoming.length > 0 && (
            <>
              <div className="timeline-section-label">Upcoming</div>
              {upcoming.map(e => (
                <div key={e.id} className="timeline-item" style={{ '--type-color': getEventColor(e) }}>
                  <div className="timeline-date">{formatDate(e.date)}</div>
                  <div className="timeline-dot" />
                  <div className="timeline-content">
                    <div className="timeline-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {e.source === 'google' && <span style={{ fontSize: 10 }}>📅</span>}
                      {e.title}
                      {e.gcalLink && <a href={e.gcalLink} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', fontSize: 10, marginLeft: 2 }}>↗</a>}
                    </div>
                    <div className="timeline-meta">
                      <span>{e.project || e.calendarName || 'Google Calendar'}</span>
                      {e.source === 'jake' && <> · <span style={{ color: TYPE_COLORS[e.type] }}>{e.type}</span></>}
                      {' · '}
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: daysUntil(e.date) === 'Today' || daysUntil(e.date).includes('ago') ? 'var(--red)' : 'var(--text-muted)' }}>
                        {daysUntil(e.date)}
                      </span>
                      {e.location && <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>📍 {e.location.slice(0, 30)}</span>}
                      {e.time && <span style={{ color: 'var(--text-dim)', marginLeft: 6 }}>🕐 {e.time}</span>}
                    </div>
                  </div>
                  {e.source === 'jake' ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="timeline-check" onClick={() => toggle(e.id)} title="Mark done">✓</button>
                      <button onClick={() => deleteEvent(e.id)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', opacity: 0.5 }} title="Delete">✕</button>
                    </div>
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
                <div key={e.id} className="timeline-item timeline-item--done" style={{ '--type-color': '#2A3050' }}>
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
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No events found.</div>
          )}
        </div>
      )}
    </div>
  );
}
