import { useMemo, useState } from 'react';

const STATUS_OPTIONS = ['Planning', 'In Development', 'Active', 'Paused', 'Completed'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];

export default function Projects({ projects, setProjects, openAI, onCreateProject, onToggleTask }) {
  const [selected, setSelected] = useState(projects[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    emoji: '🚀',
    description: '',
    tech: '',
    status: 'Planning',
    priority: 'Medium',
    color: '#5E6AD2',
    tasks: '',
  });
  const inputStyle = { width: '100%', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, marginBottom: 8 };

  const toggleTask = (projectId, taskId) => {
    if (onToggleTask) return onToggleTask(projectId, taskId);
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) }
          : p
      )
    );
  };

  const addProject = async () => {
    if (!newProject.name.trim()) return;
    const tasks = newProject.tasks.split(',').map(t => t.trim()).filter(Boolean).map((text, idx) => ({ id: idx + 1, text, done: false }));
    const project = {
      ...newProject,
      name: newProject.name.trim(),
      description: newProject.description.trim(),
      tech: newProject.tech.trim(),
      progress: 0,
      tasks,
    };

    if (onCreateProject) {
      await onCreateProject(project);
    } else {
      setProjects(prev => [project, ...prev]);
    }

    setShowAdd(false);
    setNewProject({ name: '', emoji: '🚀', description: '', tech: '', status: 'Planning', priority: 'Medium', color: '#5E6AD2', tasks: '' });
  };

  const proj = projects.find(p => p.id === selected) || projects[0];

  const completedCount = proj ? proj.tasks.filter(t => t.done).length : 0;
  const activeCount = useMemo(() => projects.filter(p => p.status === 'Active').length, [projects]);

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Projects</h1>
          <p className="module-sub">
            {projects.length} workstreams · {activeCount} active
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ai-trigger-sm" onClick={() => setShowAdd(s => !s)}>+ Add Project</button>
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
      </div>

      {showAdd && (
        <div style={{ margin: '0 28px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>New Project</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={newProject.name} onChange={e => setNewProject(f => ({ ...f, name: e.target.value }))} placeholder="Project name *" style={inputStyle} />
            <input value={newProject.emoji} onChange={e => setNewProject(f => ({ ...f, emoji: e.target.value }))} placeholder="Emoji" style={inputStyle} />
            <input value={newProject.tech} onChange={e => setNewProject(f => ({ ...f, tech: e.target.value }))} placeholder="Stack / area" style={inputStyle} />
            <input value={newProject.color} onChange={e => setNewProject(f => ({ ...f, color: e.target.value }))} placeholder="#5E6AD2" style={inputStyle} />
          </div>
          <textarea value={newProject.description} onChange={e => setNewProject(f => ({ ...f, description: e.target.value }))} placeholder="Description" style={{ ...inputStyle, width: '100%', minHeight: 62, resize: 'vertical', fontFamily: 'DM Sans, sans-serif' }} />
          <input value={newProject.tasks} onChange={e => setNewProject(f => ({ ...f, tasks: e.target.value }))} placeholder="Tasks separated by commas" style={inputStyle} />
          <div style={{ display: 'flex', gap: 8, margin: '8px 0 10px' }}>
            <select value={newProject.status} onChange={e => setNewProject(f => ({ ...f, status: e.target.value }))} style={{ ...inputStyle, marginBottom: 0 }}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={newProject.priority} onChange={e => setNewProject(f => ({ ...f, priority: e.target.value }))} style={{ ...inputStyle, marginBottom: 0 }}>
              {PRIORITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addProject} style={{ flex: 1, padding: '9px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne,sans-serif' }}>Save</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '9px 14px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="projects-layout">
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
