const STAGES = ['Prospect', 'Applied', 'In Delivery', 'Active Partner'];

const STAGE_COLORS = {
  'Prospect':      '#5A6480',
  'Applied':       '#F0B429',
  'In Delivery':   '#0ECB81',
  'Active Partner': '#5E6AD2',
};

export default function Pipeline({ pipeline, openAI }) {
  const totalConfirmed = pipeline
    .filter(p => p.stage === 'In Delivery' && p.valueUSD > 0)
    .reduce((sum, p) => sum + p.valueUSD, 0);

  const totalPending = pipeline
    .filter(p => p.stage === 'Applied' && p.valueUSD > 0)
    .reduce((sum, p) => sum + p.valueUSD, 0);

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Business Pipeline</h1>
          <p className="module-sub">
            ${totalConfirmed.toLocaleString()} in delivery · ${totalPending.toLocaleString()} applied
          </p>
        </div>
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
