import { useState } from 'react';

export default function Projects({ projects, setProjects, openAI }) {
  const [selected, setSelected] = useState(projects[0]?.id ?? null);

  const toggleTask = (projectId, taskId) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) }
          : p
      )
    );
  };

  const proj = projects.find(p => p.id === selected);

  const completedCount = proj ? proj.tasks.filter(t => t.done).length : 0;

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Projects</h1>
          <p className="module-sub">
            {projects.length} workstreams · {projects.filter(p => p.status === 'Active').length} active
          </p>
        </div>
        <button
          className="ai-trigger"
          onClick={() =>
            openAI(
              `Projects summary: ${projects
                .map(p => `${p.name} (${p.status}, ${p.progress}%, ${p.tasks.filter(t => !t.done).length} tasks remaining)`)
                .join(' | ')}`
            )
          }
        >
          ✦ Ask AI
        </button>
      </div>

      <div className="projects-layout">
        {/* Left — project list */}
        <div className="projects-list">
          {projects.map(p => (
            <div
              key={p.id}
              className={`project-card ${selected === p.id ? 'project-card--active' : ''}`}
              onClick={() => setSelected(p.id)}
              style={{ '--project-color': p.color }}
            >
              <div className="project-card-top">
                <span className="project-card-emoji">{p.emoji}</span>
                <div className="project-card-info">
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-tech">{p.tech}</div>
                </div>
                <span className={`priority priority--${p.priority.toLowerCase()}`}>
                  {p.priority}
                </span>
              </div>
              <p className="project-card-desc">{p.description}</p>
              <div className="project-card-footer">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${p.progress}%`, background: p.color }}
                  />
                </div>
                <span className="progress-label">{p.progress}%</span>
              </div>
              <div className="task-summary">
                {p.tasks.filter(t => t.done).length}/{p.tasks.length} tasks done
              </div>
            </div>
          ))}
        </div>

        {/* Right — task detail panel */}
        {proj && (
          <div className="project-detail">
            <div className="detail-header" style={{ borderBottomColor: proj.color }}>
              <span className="detail-emoji">{proj.emoji}</span>
              <div style={{ flex: 1 }}>
                <div className="detail-name">{proj.name}</div>
                <div className="detail-tech">{proj.tech}</div>
              </div>
              <button
                className="ai-trigger-sm"
                onClick={() =>
                  openAI(
                    `Project: ${proj.name}. Status: ${proj.status}. Priority: ${proj.priority}. ${proj.description} Open tasks: ${proj.tasks.filter(t => !t.done).map(t => t.text).join(', ')}`
                  )
                }
              >
                ✦ AI
              </button>
            </div>

            <div
              style={{
                padding: '8px 16px',
                fontSize: 11,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Tasks</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {completedCount}/{proj.tasks.length}
              </span>
            </div>

            <div className="task-list">
              {proj.tasks.map(t => (
                <label key={t.id} className={`task-item ${t.done ? 'task-item--done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTask(proj.id, t.id)}
                  />
                  <span>{t.text}</span>
                </label>
              ))}
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
              }}
            >
              <div className="progress-bar progress-bar--lg">
                <div
                  className="progress-fill"
                  style={{
                    width: `${proj.progress}%`,
                    background: proj.color,
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 6,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                <span>Progress</span>
                <span>{proj.progress}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
