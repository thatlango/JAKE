import { useState, useEffect } from 'react';

const FLOW_COLORS = { in: '#0ECB81', out: '#FF4757', unknown: '#5C6680' };
const FLOW_LABELS = { in: 'Received', out: 'Sent', unknown: '?' };

const CATEGORY_ICONS = {
  'Income': '💰', 'Housing': '🏠', 'Food': '🍽️', 'Transport': '🚗',
  'Education': '📚', 'Utilities': '📱', 'Health': '🏥',
  'Accommodation': '🛏️', 'Cash Withdrawal': '💵', 'Other': '📦', 'Balance': '🏦'
};

function TxRow({ tx, onDelete, onNote }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(tx.note || '');

  if (tx.type === 'unparsed') {
    return (
      <div className="tx-row tx-row--unparsed">
        <span className="tx-provider">{tx.sender || 'Unknown'}</span>
        <span className="tx-raw">{tx.raw?.slice(0, 80)}…</span>
        <span className="tx-date">{new Date(tx.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <button className="int-action-btn int-action-btn--danger" onClick={() => onDelete(tx.id)}>×</button>
      </div>
    );
  }

  if (tx.type === 'balance') {
    return (
      <div className="tx-row tx-row--balance">
        <span style={{ fontSize: 14 }}>🏦</span>
        <span className="tx-party">{tx.provider} Balance</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#5E6AD2', marginLeft: 'auto' }}>
          UGX {tx.balance?.toLocaleString()}
        </span>
        <span className="tx-date">{new Date(tx.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <button className="int-action-btn int-action-btn--danger" onClick={() => onDelete(tx.id)}>×</button>
      </div>
    );
  }

  return (
    <div className="tx-row">
      <span className="tx-flow-dot" style={{ background: FLOW_COLORS[tx.flow] }} />
      <span className="tx-cat-icon">{CATEGORY_ICONS[tx.category] || '📦'}</span>
      <div className="tx-main">
        <div className="tx-party">{tx.party}</div>
        {editing
          ? <input className="tx-note-input" value={note} autoFocus
              onChange={e => setNote(e.target.value)}
              onBlur={() => { onNote(tx.id, note); setEditing(false); }}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            />
          : <div className="tx-note" onClick={() => setEditing(true)}>
              {tx.note || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>add note…</span>}
            </div>
        }
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
        <span className="tx-amount" style={{ color: FLOW_COLORS[tx.flow] }}>
          {tx.flow === 'in' ? '+' : '-'} UGX {tx.amount?.toLocaleString()}
        </span>
        <span className="tx-provider-tag">{tx.provider}</span>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginLeft: 8 }}>
        <span className="tx-date">{new Date(tx.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        <button className="int-action-btn int-action-btn--danger" onClick={() => onDelete(tx.id)}>×</button>
      </div>
    </div>
  );
}

export default function PersonalFinance({ openAI }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [tab, setTab] = useState('transactions');
  const [webhookInfo, setWebhookInfo] = useState({ url: '', secret: 'jake-sms' });

  // Manual entry form
  const [manual, setManual] = useState({ flow: 'in', amount: '', party: '', category: 'Income', provider: 'M-Pesa', note: '', currency: 'UGX' });

  // Fetch from server
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sms/transactions');
      const data = await res.json();
      if (data.transactions) setTransactions(data.transactions);
    } catch (e) {
      console.warn('Could not fetch SMS transactions:', e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTransactions();
    // Determine webhook URL
    const origin = window.location.origin.replace(':5173', ':3001').replace(':3000', ':3001');
    setWebhookInfo(w => ({ ...w, url: `${origin}/api/sms/receive?secret=${w.secret}` }));
  }, []);

  const deleteTransaction = async (id) => {
    await fetch(`/api/sms/transactions/${id}`, { method: 'DELETE' });
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const addNote = (id, note) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, note } : t));
  };

  const addManual = async () => {
    if (!manual.amount || !manual.party) return;
    const tx = {
      id: `manual_${Date.now()}`,
      type: 'transaction',
      flow: manual.flow,
      amount: parseFloat(manual.amount),
      party: manual.party,
      provider: manual.provider,
      category: manual.category,
      timestamp: new Date().toISOString(),
      raw: 'Manual entry',
      sender: 'manual',
      note: manual.note
    };

    // Push to server
    try {
      await fetch('/api/sms/receive?secret=jake-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `Manual: UGX ${manual.amount} ${manual.flow === 'in' ? 'received from' : 'sent to'} ${manual.party}`, sender: manual.provider, timestamp: tx.timestamp })
      });
    } catch (e) { /* offline */ }

    setTransactions(prev => [tx, ...prev]);
    setManual({ flow: 'in', amount: '', party: '', category: 'Income', provider: 'M-Pesa', note: '', currency: 'UGX' });
  };

  const txns = transactions.filter(t => t.type === 'transaction');
  const filtered = filter === 'all' ? txns : txns.filter(t => t.category === filter || t.flow === filter || t.provider?.toLowerCase() === filter);

  const totalIn  = txns.filter(t => t.flow === 'in').reduce((s, t) => s + (t.amount || 0), 0);
  const totalOut = txns.filter(t => t.flow === 'out').reduce((s, t) => s + (t.amount || 0), 0);

  const catSummary = {};
  txns.forEach(t => {
    if (!catSummary[t.category]) catSummary[t.category] = { in: 0, out: 0 };
    catSummary[t.category][t.flow === 'in' ? 'in' : 'out'] += t.amount || 0;
  });

  const InputRow = ({ label, children }) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
  const Input = (props) => (
    <input {...props} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '7px 9px', color: 'var(--text)', fontSize: 13, width: '100%' }} />
  );
  const Sel = ({ value, onChange, options }) => (
    <select value={value} onChange={onChange} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '7px 9px', color: 'var(--text)', fontSize: 13, width: '100%' }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Personal Finance</h1>
          <p className="module-sub">M-Pesa · Airtel Money · Bank SMS · Manual entries</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ai-trigger-sm" onClick={fetchTransactions} disabled={loading}>
            {loading ? '⟳' : '↻'} Refresh
          </button>
          <button className="ai-trigger" onClick={() => openAI(`Personal finance: UGX ${totalIn.toLocaleString()} in, UGX ${totalOut.toLocaleString()} out. ${txns.length} transactions.`)}>✦ Ask AI</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card stat-card--green">
          <div className="stat-value">UGX {totalIn.toLocaleString()}</div>
          <div className="stat-label">Total Received</div>
        </div>
        <div className="stat-card stat-card--red">
          <div className="stat-value">UGX {totalOut.toLocaleString()}</div>
          <div className="stat-label">Total Sent / Spent</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: totalIn - totalOut >= 0 ? 'var(--green)' : 'var(--red)' }}>
            UGX {Math.abs(totalIn - totalOut).toLocaleString()}
          </div>
          <div className="stat-label">{totalIn - totalOut >= 0 ? 'Net Positive' : 'Net Negative'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{txns.length}</div>
          <div className="stat-label">Transactions</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="filter-bar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['transactions', 'summary', 'add', 'setup'].map(t => (
            <button key={t} className={`filter-btn ${tab === t ? 'filter-btn--active' : ''}`} onClick={() => setTab(t)}>
              {t === 'transactions' ? '📋 Transactions' : t === 'summary' ? '📊 Summary' : t === 'add' ? '+ Add' : '⚙ Setup'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'transactions' && (
        <div className="module-body">
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            {['all', 'in', 'out', 'Income', 'Food', 'Transport', 'Utilities', 'Other'].map(f => (
              <button key={f} className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`} onClick={() => setFilter(f)} style={{ fontSize: 10 }}>
                {f}
              </button>
            ))}
          </div>
          {filtered.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
              No transactions yet. Set up SMS forwarding in the <strong>Setup</strong> tab, or add manually in <strong>Add</strong>.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filtered.map(tx => (
              <TxRow key={tx.id} tx={tx} onDelete={deleteTransaction} onNote={addNote} />
            ))}
          </div>
        </div>
      )}

      {tab === 'summary' && (
        <div className="module-body">
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-header">By Category</div>
            {Object.entries(catSummary).map(([cat, vals]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{CATEGORY_ICONS[cat] || '📦'}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{cat}</span>
                {vals.in > 0 && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#0ECB81' }}>+{vals.in.toLocaleString()}</span>}
                {vals.out > 0 && <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#FF4757' }}>-{vals.out.toLocaleString()}</span>}
              </div>
            ))}
            {Object.keys(catSummary).length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No data yet</div>}
          </div>
        </div>
      )}

      {tab === 'add' && (
        <div className="module-body">
          <div className="card" style={{ maxWidth: 400 }}>
            <div className="card-header">Add Manual Transaction</div>
            <InputRow label="Type">
              <Sel value={manual.flow} onChange={e => setManual(p => ({ ...p, flow: e.target.value, category: e.target.value === 'in' ? 'Income' : 'Other' }))} options={['in', 'out']} />
            </InputRow>
            <InputRow label="Amount (UGX)">
              <Input type="number" value={manual.amount} onChange={e => setManual(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 50000" />
            </InputRow>
            <InputRow label="Party (who / where)">
              <Input value={manual.party} onChange={e => setManual(p => ({ ...p, party: e.target.value }))} placeholder="e.g. Gulu Market" />
            </InputRow>
            <InputRow label="Category">
              <Sel value={manual.category} onChange={e => setManual(p => ({ ...p, category: e.target.value }))} options={Object.keys(CATEGORY_ICONS)} />
            </InputRow>
            <InputRow label="Provider">
              <Sel value={manual.provider} onChange={e => setManual(p => ({ ...p, provider: e.target.value }))} options={['M-Pesa', 'Airtel', 'Stanbic', 'DFCU', 'Centenary', 'Cash', 'Other']} />
            </InputRow>
            <InputRow label="Note">
              <Input value={manual.note} onChange={e => setManual(p => ({ ...p, note: e.target.value }))} placeholder="Optional" />
            </InputRow>
            <button className="ai-trigger" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={addManual}>
              Add Transaction
            </button>
          </div>
        </div>
      )}

      {tab === 'setup' && (
        <div className="module-body">
          <div className="card" style={{ maxWidth: 560, marginBottom: 12 }}>
            <div className="card-header">📱 SMS Forwarding Setup (Android)</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
              Install <strong style={{ color: 'var(--text)' }}>SMS Forwarder</strong> (free, on Play Store) on your Android phone.
              Configure it to forward SMS from <strong style={{ color: 'var(--accent)' }}>MPESA, Airtel, your bank</strong> to this webhook URL:
            </p>
            <div style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--cyan)', wordBreak: 'break-all', marginBottom: 10 }}>
              {webhookInfo.url || 'Start the server to see your webhook URL'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              In SMS Forwarder: <strong>Add Rule</strong> → Filter by sender: <code>MPESA</code>, <code>AIRTEL</code>, or your bank shortcode → Forward to URL (POST) → paste the URL above → Method: POST → Body type: JSON → Map <code>message</code> → body, <code>sender</code> → from.
            </p>
          </div>

          <div className="card" style={{ maxWidth: 560, marginBottom: 12 }}>
            <div className="card-header">🌍 Africa's Talking (Alternative)</div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, marginBottom: 8 }}>
              If using Africa's Talking for inbound SMS: set your callback URL to the same webhook. AT sends <code>from</code>, <code>text</code>, and <code>date</code> — all supported.
            </p>
            <div style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--cyan)', wordBreak: 'break-all' }}>
              POST {webhookInfo.url || '…'}
            </div>
          </div>

          <div className="card" style={{ maxWidth: 560 }}>
            <div className="card-header">🔑 Webhook Secret</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Set <code>SMS_WEBHOOK_SECRET</code> in Netlify environment variables to change the secret. Default: <code>jake-sms</code>
            </p>
            <div style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--accent)' }}>
              SMS_WEBHOOK_SECRET = {webhookInfo.secret}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
