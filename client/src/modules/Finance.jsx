const STATUS_COLORS = {
  Confirmed: '#0ECB81',
  Pending:   '#F0B429',
  Projected: '#5E6AD2',
};

export default function Finance({ finance, openAI }) {
  const { streams, expenses, targets } = finance;

  const confirmed  = streams.filter(s => s.status === 'Confirmed').reduce((sum, s) => sum + s.amount, 0);
  const pending    = streams.filter(s => s.status === 'Pending').reduce((sum, s) => sum + s.amount, 0);
  const projected  = streams.filter(s => s.status === 'Projected').reduce((sum, s) => sum + s.amount, 0);
  const totalPipe  = confirmed + pending + projected;

  const monthlyExpenses = expenses.filter(e => e.monthly).reduce((sum, e) => sum + e.amount, 0);
  const onetimeExpenses = expenses.filter(e => !e.monthly).reduce((sum, e) => sum + e.amount, 0);

  const qPct     = Math.min(100, Math.round((confirmed / targets.quarterly) * 100));
  const qPending = Math.min(100 - qPct, Math.round((pending / targets.quarterly) * 100));

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Finance</h1>
          <p className="module-sub">
            Revenue tracking · Expenses · Targets
          </p>
        </div>
        <button
          className="ai-trigger"
          onClick={() =>
            openAI(
              `Finance snapshot: confirmed $${confirmed.toLocaleString()}, pending $${pending.toLocaleString()}, projected $${projected.toLocaleString()}, monthly expenses $${monthlyExpenses}/mo, quarterly target $${targets.quarterly.toLocaleString()}`
            )
          }
        >
          ✦ Ask AI
        </button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card stat-card--green">
          <div className="stat-value">${confirmed.toLocaleString()}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card stat-card--amber">
          <div className="stat-value">${pending.toLocaleString()}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">${projected.toLocaleString()}</div>
          <div className="stat-label">Projected</div>
        </div>
        <div className="stat-card stat-card--red">
          <div className="stat-value">${monthlyExpenses}/mo</div>
          <div className="stat-label">Monthly Costs</div>
        </div>
      </div>

      {/* Grid */}
      <div className="finance-grid">
        {/* Revenue table */}
        <div className="card" style={{ overflowY: 'auto' }}>
          <div className="card-header">Revenue Streams</div>
          <table className="finance-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Type</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {streams.map(s => (
                <tr key={s.id}>
                  <td className="finance-name">{s.name}</td>
                  <td><span className="badge">{s.type}</span></td>
                  <td>
                    <span
                      className="badge"
                      style={{ color: STATUS_COLORS[s.status], borderColor: STATUS_COLORS[s.status] + '40' }}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="finance-amount">${s.amount.toLocaleString()}</td>
                  <td className="finance-period">{s.month}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ paddingTop: 12, color: 'var(--text-muted)', fontSize: 11 }}>
                  Total pipeline
                </td>
                <td
                  className="finance-amount"
                  style={{ paddingTop: 12, color: 'var(--text)', borderTop: '1px solid var(--border-strong)' }}
                >
                  ${totalPipe.toLocaleString()}
                </td>
                <td style={{ borderTop: '1px solid var(--border-strong)' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Expenses + target */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          <div className="card">
            <div className="card-header">Expenses</div>
            {expenses.map(e => (
              <div key={e.id} className="expense-row">
                <div className="expense-name">{e.name}</div>
                {e.monthly
                  ? <span className="badge badge--monthly">Monthly</span>
                  : <span className="badge">One-time</span>
                }
                <div className="expense-amount">${e.amount}{e.monthly ? '/mo' : ''}</div>
              </div>
            ))}
            <div className="expense-total">
              <span>Monthly total</span>
              <span>${monthlyExpenses}/mo</span>
            </div>
          </div>

          <div className="card">
            <div className="card-header">Quarterly Target</div>
            <div
              style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.8px',
                color: 'var(--text)',
                marginBottom: 4,
              }}
            >
              ${targets.quarterly.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
              Q2 2026 target
            </div>

            <div className="progress-label-row">
              <span>Confirmed</span>
              <span style={{ color: '#0ECB81' }}>{qPct}%</span>
            </div>
            <div className="progress-bar progress-bar--lg" style={{ marginBottom: 8 }}>
              <div
                className="progress-fill"
                style={{ width: `${qPct}%`, background: '#0ECB81' }}
              />
              <div
                className="progress-fill"
                style={{
                  width: `${qPending}%`,
                  background: '#F0B429',
                  opacity: 0.55,
                  borderRadius: 0,
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <span>Gap: ${Math.max(0, targets.quarterly - confirmed).toLocaleString()}</span>
              <span style={{ color: '#F0B429' }}>+${pending.toLocaleString()} pending</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
