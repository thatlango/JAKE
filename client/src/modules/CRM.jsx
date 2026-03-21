import { useState, useEffect, useCallback } from 'react';
import { askClaude } from '../api/claude';

function FollowUpDraft({ client, interactions, onClose }) {
  const [draft,   setDraft]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const [copied,  setCopied]  = useState(false);

  const generate = async () => {
    setBusy(true);
    const last = (interactions||[]).filter(i=>i.type!=='payment').slice(0,3)
      .map(i=>`[${i.date}] ${i.type}: ${i.title||i.type} — ${i.content?.slice(0,120)||''}`).join('\n');
    const daysSince = client.last_contact
      ? Math.floor((new Date()-new Date(client.last_contact))/86400000) : 'unknown';
    const msg = await askClaude([{ role:'user', content:
      `Draft a short, warm follow-up message for Jacob to send to ${client.name} at ${client.org||''}.\n\nContext:\n- Last contact: ${daysSince} days ago\n- Recent interactions:\n${last||'No recent interactions'}\n- Role: ${client.role||'—'}\n- Next followup note: ${client.next_followup||'—'}\n\nMessage should be:\n- 3-4 sentences max\n- Professional but personal tone\n- Reference the relationship or last conversation if relevant\n- End with a clear next step or question\n- No subject line needed (this is for WhatsApp/direct message)\n\nWrite only the message body, nothing else.`
    }], 'crm');
    setDraft(typeof msg === 'string' ? msg : '');
    setBusy(false);
  };

  useEffect(() => { generate(); }, []); // eslint-disable-line

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draft).then(() => { setCopied(true); setTimeout(()=>setCopied(false), 2000); });
  };

  const waLink = client.phone
    ? `https://wa.me/${client.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(draft)}`
    : null;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, maxWidth:460, width:'100%', maxHeight:'80vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15 }}>✦ Smart Follow-Up</div>
          <button onClick={onClose} style={{ color:'var(--text-muted)', background:'none', border:'none', fontSize:18, cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:12 }}>
          Drafted for <strong style={{ color:'var(--text)' }}>{client.name}</strong> · {client.org}
        </div>
        {busy ? (
          <div style={{ padding:'24px 0', textAlign:'center', color:'var(--blue)', fontSize:13 }}>✦ Drafting with AI…</div>
        ) : (
          <>
            <textarea value={draft} onChange={e=>setDraft(e.target.value)}
              style={{ width:'100%', minHeight:140, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:8, padding:12, color:'var(--text)', fontSize:13, lineHeight:1.75, resize:'vertical', fontFamily:'DM Sans,sans-serif', marginBottom:12 }} />
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={copyToClipboard}
                style={{ flex:1, padding:9, background: copied?'var(--green-dim)':'var(--surface-3)', color: copied?'var(--green)':'var(--text-muted)', border:`1px solid ${copied?'rgba(14,203,129,.3)':'var(--border)'}`, borderRadius:6, fontWeight:600, fontSize:12, cursor:'pointer' }}>
                {copied ? '✓ Copied!' : '📋 Copy'}
              </button>
              {waLink && (
                <a href={waLink} target="_blank" rel="noreferrer"
                  style={{ flex:2, padding:9, background:'#25D366', color:'#fff', border:'none', borderRadius:6, fontWeight:700, fontSize:12, cursor:'pointer', textAlign:'center', display:'block', textDecoration:'none' }}>
                  📱 Open in WhatsApp
                </a>
              )}
              <button onClick={generate} disabled={busy}
                style={{ flex:1, padding:9, background:'var(--blue-dim)', color:'var(--blue)', border:'1px solid rgba(94,106,210,.25)', borderRadius:6, fontWeight:600, fontSize:12, cursor:'pointer' }}>
                ↺ Regenerate
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const TYPE_COLORS = {
  note: '#5E6AD2', call: '#0ECB81', email: '#F0B429',
  meeting: '#9F7AEA', proposal: '#FF4757', payment: '#10B981',
};
const TYPE_ICONS = {
  note: '📝', call: '📞', email: '✉️', meeting: '🤝', proposal: '📋', payment: '💳',
};
const PAYMENT_METHODS = ['Mobile Money', 'Bank Transfer', 'Cash', 'Wire Transfer', 'Cheque'];
const CURRENCIES = ['USD', 'UGX', 'KES', 'EUR', 'GBP'];

// ── helpers to embed contract value in notes field ──
function parseContract(notes) {
  if (notes && notes.startsWith('__CV__:')) {
    const end = notes.indexOf('\n---\n');
    try {
      return JSON.parse(end > 0 ? notes.slice(7, end) : notes.slice(7));
    } catch { return null; }
  }
  return null;
}
function buildNotes(contract, plain) {
  if (!contract?.value) return plain || '';
  return `__CV__:${JSON.stringify(contract)}\n---\n${plain || ''}`;
}
function plainNotes(notes) {
  if (notes && notes.startsWith('__CV__:')) {
    const end = notes.indexOf('\n---\n');
    return end > 0 ? notes.slice(end + 5) : '';
  }
  return notes || '';
}
function fmtMoney(amount, currency = 'USD') {
  if (!amount) return '—';
  return `${currency} ${Number(amount).toLocaleString()}`;
}

function ClientCard({ client, active, onClick }) {
  const contract = parseContract(client.notes);
  const daysSince = client.last_contact
    ? Math.floor((new Date() - new Date(client.last_contact)) / 86400000)
    : null;
  const overdue = daysSince > 30;

  return (
    <div
      className={`project-card ${active ? 'project-card--active' : ''}`}
      onClick={onClick}
      style={{ '--project-color': overdue ? '#FF4757' : '#0ECB81', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{client.avatar_emoji || '👤'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{client.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {client.org}{client.role ? ` · ${client.role}` : ''}
          </div>
        </div>
        <span className={`badge ${client.status === 'Active' ? 'badge--active' : ''}`}>{client.type}</span>
      </div>
      {contract?.value && (
        <div style={{ marginTop: 6, fontSize: 11, display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
            Contract: {fmtMoney(contract.value, contract.currency)}
          </span>
          {contract.received > 0 && (
            <span style={{ color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>
              Paid: {fmtMoney(contract.received, contract.currency)}
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
        {client.last_contact
          ? <span style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {daysSince === 0 ? 'Today' : `${daysSince}d ago`}
            </span>
          : <span style={{ fontSize: 11, color: 'var(--red)', fontStyle: 'italic' }}>No contact</span>
        }
        {client.next_followup && (
          <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>
            📋 {new Date(client.next_followup) <= new Date() ? '⚠ Follow-up DUE' : `Follow-up ${client.next_followup}`}
          </span>
        )}
      </div>
    </div>
  );
}

function InteractionForm({ clientId, onSave, onCancel }) {
  const [form, setForm] = useState({
    type: 'note', title: '', content: '', date: new Date().toISOString().slice(0, 10),
    outcome: '', follow_up_date: '', follow_up_note: '',
    pay_amount: '', pay_currency: 'USD', pay_method: 'Mobile Money', pay_reference: '', pay_status: 'Received',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (form.type === 'payment') {
      if (!form.pay_amount) return;
      const payContent = JSON.stringify({
        amount: parseFloat(form.pay_amount),
        currency: form.pay_currency,
        method: form.pay_method,
        reference: form.pay_reference,
        status: form.pay_status,
      });
      await fetch(`/api/crm/clients/${clientId}/interactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, content: payContent, title: form.title || `Payment — ${fmtMoney(form.pay_amount, form.pay_currency)}` }),
      });
    } else {
      if (!form.content.trim()) return;
      await fetch(`/api/crm/clients/${clientId}/interactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    onSave();
  };

  const inp = (key, placeholder, type = 'text') => (
    <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, marginBottom: 8 }} />
  );
  const sel = (key, opts) => (
    <select value={form[key]} onChange={e => set(key, e.target.value)}
      style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 13 }}>
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {['note', 'call', 'email', 'meeting', 'proposal', 'payment'].map(t => (
          <button key={t} onClick={() => set('type', t)} style={{
            padding: '5px 10px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, fontWeight: 600,
            background: form.type === t ? TYPE_COLORS[t] + '22' : 'transparent',
            color: form.type === t ? TYPE_COLORS[t] : 'var(--text-muted)', cursor: 'pointer',
          }}>{TYPE_ICONS[t]} {t}</button>
        ))}
      </div>

      {form.type === 'payment' ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="number" value={form.pay_amount} onChange={e => set('pay_amount', e.target.value)} placeholder="Amount *"
              style={{ flex: 2, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            {sel('pay_currency', CURRENCIES)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {sel('pay_method', PAYMENT_METHODS)}
            {sel('pay_status', ['Received', 'Pending', 'Partial'])}
          </div>
          {inp('pay_reference', 'Reference / Transaction ID')}
          {inp('title', 'Note (optional)')}
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 13, marginBottom: 8 }} />
        </>
      ) : (
        <>
          {inp('title', 'Title (optional)')}
          <textarea value={form.content} onChange={e => set('content', e.target.value)} placeholder="What happened / what was discussed…"
            style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, minHeight: 80, resize: 'vertical', marginBottom: 8, fontFamily: 'DM Sans, sans-serif' }} />
          {inp('outcome', 'Outcome / next step')}
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 13 }} />
            <input type="date" value={form.follow_up_date} onChange={e => set('follow_up_date', e.target.value)}
              placeholder="Follow-up date"
              style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 13 }} />
          </div>
          {form.follow_up_date && <div style={{ marginTop: 8 }}>{inp('follow_up_note', 'Follow-up reminder message')}</div>}
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={save} style={{ flex: 1, padding: '9px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>Save</button>
        <button onClick={onCancel} style={{ padding: '9px 14px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

function PaymentSummary({ interactions, contract }) {
  const payments = (interactions || []).filter(i => i.type === 'payment');
  const totalReceived = payments.reduce((sum, p) => {
    try { const d = JSON.parse(p.content); return sum + (d.status !== 'Pending' ? (d.amount || 0) : 0); } catch { return sum; }
  }, 0);
  const currency = contract?.currency || 'USD';
  const outstanding = contract?.value ? Math.max(0, contract.value - totalReceived) : null;

  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Payment Summary</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {contract?.value && (
          <div style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace' }}>{fmtMoney(contract.value, currency)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Contract Value</div>
          </div>
        )}
        <div style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>{fmtMoney(totalReceived, currency)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Received</div>
        </div>
        {outstanding !== null && (
          <div style={{ flex: 1, background: 'var(--surface-3)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: outstanding > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>{fmtMoney(outstanding, currency)}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{outstanding > 0 ? 'Outstanding' : 'Settled ✓'}</div>
          </div>
        )}
      </div>
      {payments.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 6 }}>No payments logged yet.</div>}
      {payments.map(p => {
        let d = {};
        try { d = JSON.parse(p.content); } catch {}
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13 }}>💳</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: d.status === 'Pending' ? 'var(--amber)' : 'var(--green)' }}>{fmtMoney(d.amount, d.currency)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{d.method}</span>
              {d.reference && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 6 }}>#{d.reference}</span>}
            </div>
            <span style={{ fontSize: 10, color: d.status === 'Received' ? 'var(--green)' : 'var(--amber)', fontWeight: 600 }}>{d.status}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{p.date}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CRM({ openAI }) {
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState({});
  const [selected, setSelected] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [logging,    setLogging]    = useState(false);
  const [followUpClient, setFollowUpClient] = useState(null);
  const [filter, setFilter] = useState('All');
  const [detailTab, setDetailTab] = useState('interactions'); // 'interactions' | 'payments'
  const [showAdd, setShowAdd] = useState(false);
  const [newClient, setNewClient] = useState({
    name: '', org: '', role: '', type: 'Partner', status: 'Active', avatar_emoji: '👤',
    email: '', phone: '', whatsapp: '', location: '', notes: '',
    contract_value: '', contract_currency: 'USD',
  });

  const load = useCallback(async () => {
    const res = await fetch('/api/crm/clients');
    const data = await res.json();
    setClients(data.clients || []);
    setStats(data.stats || {});
  }, []);

  const loadDetail = useCallback(async (id) => {
    const res = await fetch(`/api/crm/clients/${id}`);
    const data = await res.json();
    setClientDetail(data.client);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);

  const filteredClients = filter === 'All' ? clients : clients.filter(c => c.type === filter || c.status === filter);

  // Compute aggregate contract stats
  const contractStats = clients.reduce((acc, c) => {
    const cv = parseContract(c.notes);
    if (cv?.value) {
      acc.totalContract += cv.value;
      acc.totalReceived += cv.received || 0;
    }
    return acc;
  }, { totalContract: 0, totalReceived: 0 });

  const addClient = async () => {
    if (!newClient.name) return;
    const contract = newClient.contract_value
      ? { value: parseFloat(newClient.contract_value), currency: newClient.contract_currency, received: 0 }
      : null;
    const notes = buildNotes(contract, newClient.notes);
    await fetch('/api/crm/clients', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newClient, notes }),
    });
    setShowAdd(false);
    setNewClient({ name: '', org: '', role: '', type: 'Partner', status: 'Active', avatar_emoji: '👤', email: '', phone: '', whatsapp: '', location: '', notes: '', contract_value: '', contract_currency: 'USD' });
    load();
  };

  const interactionSaved = () => {
    setLogging(false);
    if (selected) loadDetail(selected);
    load();
  };

  const inp = (key, placeholder, type = 'text') => (
    <input type={type} value={newClient[key] || ''} onChange={e => setNewClient(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
      style={{ width: '100%', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, marginBottom: 8 }} />
  );

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Client CRM</h1>
          <p className="module-sub">
            {stats.active} active · {stats.dueFollowups > 0 && <span style={{ color: 'var(--red)' }}>⚠ {stats.dueFollowups} follow-ups due · </span>}
            {stats.noContact30d > 0 && <span style={{ color: 'var(--accent)' }}>{stats.noContact30d} not contacted in 30d</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ai-trigger-sm" onClick={() => setShowAdd(s => !s)}>+ Add Client</button>
          <button className="ai-trigger" onClick={() => openAI(`CRM: ${stats.total} contacts, ${stats.dueFollowups} follow-ups due, contract portfolio $${contractStats.totalContract.toLocaleString()} total.`)}>✦ Ask AI</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card stat-card--green"><div className="stat-value">{stats.total || 0}</div><div className="stat-label">Contacts</div></div>
        <div className="stat-card stat-card--red"><div className="stat-value">{stats.dueFollowups || 0}</div><div className="stat-label">Follow-ups Due</div></div>
        {contractStats.totalContract > 0 && (
          <>
            <div className="stat-card stat-card--amber">
              <div className="stat-value" style={{ fontSize: 14 }}>${contractStats.totalContract.toLocaleString()}</div>
              <div className="stat-label">Total Contract</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 14 }}>${contractStats.totalReceived.toLocaleString()}</div>
              <div className="stat-label">Total Received</div>
            </div>
          </>
        )}
        {contractStats.totalContract === 0 && (
          <>
            <div className="stat-card stat-card--amber"><div className="stat-value">{stats.noContact30d || 0}</div><div className="stat-label">No Contact 30d</div></div>
            <div className="stat-card"><div className="stat-value">{stats.interactions7d || 0}</div><div className="stat-label">Interactions 7d</div></div>
          </>
        )}
      </div>

      {/* Add client form */}
      {showAdd && (
        <div style={{ margin: '0 28px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>New Client</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {inp('name', 'Full name *')} {inp('org', 'Organisation')}
            {inp('role', 'Role / title')} {inp('avatar_emoji', 'Emoji avatar')}
            {inp('email', 'Email address')} {inp('phone', 'Phone / WhatsApp')}
            {inp('location', 'Location / City')}
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="number" value={newClient.contract_value} onChange={e => setNewClient(f => ({ ...f, contract_value: e.target.value }))} placeholder="Contract value"
                style={{ flex: 2, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, marginBottom: 8 }} />
              <select value={newClient.contract_currency} onChange={e => setNewClient(f => ({ ...f, contract_currency: e.target.value }))}
                style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 6px', color: 'var(--text)', fontSize: 13, marginBottom: 8 }}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {['Partner', 'Client', 'Prospect', 'Funder'].map(t => (
              <button key={t} onClick={() => setNewClient(f => ({ ...f, type: t }))} style={{
                padding: '5px 10px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: newClient.type === t ? 'var(--accent-dim)' : 'transparent', color: newClient.type === t ? 'var(--accent)' : 'var(--text-muted)',
              }}>{t}</button>
            ))}
          </div>
          <textarea value={newClient.notes} onChange={e => setNewClient(f => ({ ...f, notes: e.target.value }))} placeholder="Notes…"
            style={{ width: '100%', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, minHeight: 60, resize: 'vertical', marginBottom: 8, fontFamily: 'DM Sans, sans-serif' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addClient} style={{ flex: 1, padding: '9px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne,sans-serif' }}>Save Client</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '9px 14px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="filter-bar">
        {['All', 'Active', 'Partner', 'Client', 'Prospect', 'Funder'].map(f => (
          <button key={f} className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="projects-layout">
        {/* Client list */}
        <div className="projects-list">
          {filteredClients.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>No contacts yet.</div>}
          {filteredClients.map(c => (
            <ClientCard key={c.id} client={c} active={selected === c.id} onClick={() => { setSelected(c.id); setDetailTab('interactions'); }} />
          ))}
        </div>

        {/* Detail panel */}
        {clientDetail && (
          <div className="project-detail">
            <div className="detail-header">
              <span style={{ fontSize: 24 }}>{clientDetail.avatar_emoji || '👤'}</span>
              <div style={{ flex: 1 }}>
                <div className="detail-name">{clientDetail.name}</div>
                <div className="detail-tech">{clientDetail.org}{clientDetail.role ? ` · ${clientDetail.role}` : ''}</div>
              </div>
              <button className="ai-trigger-sm" onClick={() => openAI(`Client: ${clientDetail.name} at ${clientDetail.org}. Last contact: ${clientDetail.last_contact || 'never'}. ${clientDetail.interactions?.length || 0} interactions.`)}>✦ AI</button>
            </div>

            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {clientDetail.email && <a href={`mailto:${clientDetail.email}`} style={{ fontSize: 11, color: 'var(--blue)' }}>✉ {clientDetail.email}</a>}
              {clientDetail.phone && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>📞 {clientDetail.phone}</span>}
              {clientDetail.next_followup && (
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>📋 Follow-up: {clientDetail.next_followup}</span>
              )}
            </div>

            {/* Payment summary */}
            <PaymentSummary
              interactions={clientDetail.interactions}
              contract={parseContract(clientDetail.notes)}
            />

            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display:'flex', gap:8 }}>
              <button onClick={() => setLogging(l => !l)} style={{ flex:1, background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid rgba(94,106,210,.25)', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {logging ? '× Cancel' : '+ Log Interaction'}
              </button>
              <button onClick={() => setFollowUpClient(clientDetail)}
                style={{ flex:1, background:'var(--accent-dim)', color:'var(--accent)', border:'1px solid rgba(240,180,41,.25)', borderRadius:6, padding:'7px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                ✦ Smart Follow-Up
              </button>
            </div>

            {logging && (
              <div style={{ padding: '0 16px', paddingTop: 10 }}>
                <InteractionForm clientId={clientDetail.id} onSave={interactionSaved} onCancel={() => setLogging(false)} />
              </div>
            )}

            {/* Detail tabs */}
            <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
              {[['interactions', 'History'], ['payments', 'Payments']].map(([id, label]) => (
                <button key={id} onClick={() => setDetailTab(id)} style={{
                  padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: detailTab === id ? 'var(--accent-dim)' : 'transparent',
                  color: detailTab === id ? 'var(--accent)' : 'var(--text-muted)',
                }}>{label}</button>
              ))}
            </div>

            <div className="task-list">
              {detailTab === 'interactions' && (
                <>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Interaction History</div>
                  {(!clientDetail.interactions || clientDetail.interactions.filter(i => i.type !== 'payment').length === 0) && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>No interactions yet.</div>
                  )}
                  {(clientDetail.interactions || []).filter(i => i.type !== 'payment').map(i => (
                    <div key={i.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 13 }}>{TYPE_ICONS[i.type] || '📝'}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{i.title || i.type}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{i.date}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, paddingLeft: 19 }}>{i.content}</div>
                      {i.outcome && <div style={{ fontSize: 11, color: 'var(--accent)', paddingLeft: 19, marginTop: 3 }}>→ {i.outcome}</div>}
                    </div>
                  ))}
                </>
              )}

              {detailTab === 'payments' && (
                <>
                  <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Payment Ledger</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Use <strong>Log Interaction / Payment</strong> above and select <strong>payment</strong> to record new payments.
                  </div>
                  {(clientDetail.interactions || []).filter(i => i.type === 'payment').length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>No payments logged yet.</div>
                  )}
                  {(clientDetail.interactions || []).filter(i => i.type === 'payment').map(p => {
                    let d = {};
                    try { d = JSON.parse(p.content); } catch {}
                    return (
                      <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>💳</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: d.status === 'Pending' ? 'var(--amber)' : 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>{fmtMoney(d.amount, d.currency)}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>{d.method}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: d.status === 'Received' ? 'var(--green)' : 'var(--amber)', background: d.status === 'Received' ? 'rgba(14,203,129,.1)' : 'rgba(240,180,41,.1)', padding: '2px 6px', borderRadius: 4 }}>{d.status}</span>
                        </div>
                        {d.reference && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, paddingLeft: 22 }}>Ref: {d.reference}</div>}
                        {p.title && p.title !== `Payment — ${fmtMoney(d.amount, d.currency)}` && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, paddingLeft: 22 }}>{p.title}</div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2, paddingLeft: 22, fontFamily: 'JetBrains Mono, monospace' }}>{p.date}</div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {followUpClient && (
        <FollowUpDraft
          client={followUpClient}
          interactions={clientDetail?.interactions}
          onClose={() => setFollowUpClient(null)}
        />
      )}
    </div>
  );
}
