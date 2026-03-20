import { useState } from 'react';

const STAGES = ['Prospect', 'Applied', 'In Delivery', 'Active Partner'];

const STAGE_COLORS = {
  Prospect: '#5A6480',
  Applied: '#F0B429',
  'In Delivery': '#0ECB81',
  'Active Partner': '#5E6AD2',
};

export default function Pipeline({ pipeline, openAI, onAddProspect }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: '',
    org: '',
    valueUSD: '',
    stage: 'Prospect',
    type: 'Partnership',
    deadline: '',
    contact: '',
    notes: '',
  });

  const inputStyle = { width: '100%', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, marginBottom: 8 };

  const totalConfirmed = pipeline
    .filter(p => p.stage === 'In Delivery' && p.valueUSD > 0)
    .reduce((sum, p) => sum + p.valueUSD, 0);

  const totalPending = pipeline
    .filter(p => p.stage === 'Applied' && p.valueUSD > 0)
    .reduce((sum, p) => sum + p.valueUSD, 0);

  const addProspect = async () => {
    if (!form.name.trim() || !form.org.trim()) return;
    const valueUSD = Number(form.valueUSD) || 0;
    const item = {
      ...form,
      name: form.name.trim(),
      org: form.org.trim(),
      valueUSD,
      value: valueUSD > 0 ? `$${valueUSD.toLocaleString()}` : 'TBD',
      deadline: form.deadline || null,
      notes: form.notes.trim(),
      contact: form.contact.trim(),
    };
    if (onAddProspect) await onAddProspect(item);
    setShowAdd(false);
    setForm({ name: '', org: '', valueUSD: '', stage: 'Prospect', type: 'Partnership', deadline: '', contact: '', notes: '' });
  };

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Business Pipeline</h1>
          <p className="module-sub">
            ${totalConfirmed.toLocaleString()} in delivery · ${totalPending.toLocaleString()} applied
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ai-trigger-sm" onClick={() => setShowAdd(s => !s)}>+ Add Prospect</button>
          <button
            className="ai-trigger"
            onClick={() =>
              openAI(
                `Pipeline: ${pipeline
                  .map(p => `${p.name} at ${p.org} — ${p.stage}${p.valueUSD > 0 ? ` ($${p.valueUSD.toLocaleString()})` : ''}`)
                  .join('; ')}`
              )
            }
          >
            ✦ Ask AI
          </button>
        </div>
      </div>

      {showAdd && (
        <div style={{ margin: '0 28px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>New Prospect</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Opportunity name *" style={inputStyle} />
            <input value={form.org} onChange={e => setForm(f => ({ ...f, org: e.target.value }))} placeholder="Organization *" style={inputStyle} />
            <input value={form.valueUSD} onChange={e => setForm(f => ({ ...f, valueUSD: e.target.value }))} placeholder="Value USD" type="number" style={inputStyle} />
            <input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} placeholder="Type" style={inputStyle} />
            <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))} style={inputStyle}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} type="date" style={inputStyle} />
          </div>
          <input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Primary contact" style={inputStyle} />
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" style={{ ...inputStyle, minHeight: 62, resize: 'vertical', fontFamily: 'DM Sans, sans-serif' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addProspect} style={{ flex: 1, padding: '9px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne,sans-serif' }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '9px 14px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="pipeline-kanban">
        {STAGES.map(stage => {
          const items = pipeline.filter(p => p.stage === stage);
          return (
            <div key={stage} className="kanban-col">
              <div className="kanban-col-header">
                <span className="kanban-dot" style={{ background: STAGE_COLORS[stage] }} />
                <span>{stage}</span>
                <span className="kanban-count">{items.length}</span>
              </div>

              <div className="kanban-items">
                {items.length === 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text-dim)',
                      padding: '8px 0',
                      textAlign: 'center',
                    }}
                  >
                    Empty
                  </div>
                )}
                {items.map(item => (
                  <div key={item.id} className="kanban-card">
                    <div className="kanban-card-org">{item.org}</div>
                    <div className="kanban-card-name">{item.name}</div>
                    {item.valueUSD > 0 && (
                      <div className="kanban-card-value">
                        ${item.valueUSD.toLocaleString()}
                      </div>
                    )}
                    {item.deadline && (
                      <div className="kanban-card-deadline">
                        Due{' '}
                        {new Date(item.deadline).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </div>
                    )}
                    <div className="kanban-card-notes">{item.notes}</div>
                    <div className={`kanban-type kanban-type--${item.type.toLowerCase()}`}>
                      {item.type}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
