import { useState } from 'react';

const COLORS = ['#F0B429', '#10B981', '#9F7AEA', '#EF4444', '#06B6D4', '#5E6AD2', '#FF4757', '#0ECB81'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES = ['Planning', 'In Development', 'Active', 'On Hold', 'Completed'];

const DEFAULT_NEW = {
  name: '', emoji: '🚀', description: '', tech: '',
  status: 'Planning', priority: 'Medium', color: '#5E6AD2', progress: 0,
};

export default function Projects({ projects, setProjects, openAI }) {
  const [selected, setSelected] = useState(projects[0]?.id ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [newProject, setNewProject] = useState(DEFAULT_NEW);
  const [newTaskText, setNewTaskText] = useState('');

  const proj = projects.find(p => p.id === selected);
  const completedCount = proj ? proj.tasks.filter(t => t.done).length : 0;

  const toggleTask = (projectId, taskId) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) }
          : p
      )
    );
  };

  const addTask = () => {
    if (!newTaskText.trim() || !proj) return;
    const maxId = Math.max(0, ...proj.tasks.map(t => t.id));
    setProjects(prev =>
      prev.map(p =>
        p.id === proj.id
          ? { ...p, tasks: [...p.tasks, { id: maxId + 1, text: newTaskText.trim(), done: false }] }
          : p
      )
    );
    setNewTaskText('');
  };

  const deleteTask = (projectId, taskId) => {
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? { ...p, tasks: p.tasks.filter(t => t.id !== taskId) }
          : p
      )
    );
  };

  const addProject = () => {
    if (!newProject.name.trim()) return;
    const id = `proj_${Date.now()}`;
    setProjects(prev => [...prev, { ...newProject, id, tasks: [], progress: Number(newProject.progress) || 0 }]);
    setNewProject(DEFAULT_NEW);
    setShowAdd(false);
    setSelected(id);
  };

  const deleteProject = (id) => {
    if (!confirm('Delete this project?')) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    setSelected(projects.find(p => p.id !== id)?.id ?? null);
  };

  const set = (k, v) => setNewProject(f => ({ ...f, [k]: v }));

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Projects</h1>
          <p className="module-sub">
            {projects.length} workstreams · {projects.filter(p => p.status === 'Active').length} active
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ai-trigger-sm" onClick={() => setShowAdd(s => !s)}>+ New Project</button>
          <button className="ai-trigger" onClick={() =>
            openAI(`Projects: ${projects.map(p => `${p.name} (${p.status}, ${p.progress}%, ${p.tasks.filter(t => !t.done).length} tasks remaining)`).join(' | ')}`)
          }>✦ Ask AI</button>
        </div>
      </div>

      {/* Add project form */}
      {showAdd && (
        <div style={{ margin: '0 28px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 12 }}>New Project</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={newProject.name} onChange={e => set('name', e.target.value)} placeholder="Project name *"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={newProject.emoji} onChange={e => set('emoji', e.target.value)} placeholder="Emoji"
                style={{ width: 60, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 16, textAlign: 'center' }} />
              <input value={newProject.tech} onChange={e => set('tech', e.target.value)} placeholder="Tech / tools"
                style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            </div>
          </div>
          <textarea value={newProject.description} onChange={e => set('description', e.target.value)} placeholder="Description…"
            style={{ width: '100%', marginTop: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13, minHeight: 60, resize: 'vertical', fontFamily: 'DM Sans, sans-serif' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select value={newProject.status} onChange={e => set('status', e.target.value)}
              style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={newProject.priority} onChange={e => set('priority', e.target.value)}
              style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
              <input type="number" min={0} max={100} value={newProject.progress} onChange={e => set('progress', e.target.value)}
                style={{ width: 56, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 6px', color: 'var(--text)', fontSize: 13, textAlign: 'center' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => set('color', c)} style={{
                width: 24, height: 24, borderRadius: '50%', background: c, border: newProject.color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={addProject} style={{ flex: 1, padding: '9px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne,sans-serif' }}>Add Project</button>
            <button onClick={() => setShowAdd(false)} style={{ padding: '9px 14px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

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
                <span className={`priority priority--${p.priority.toLowerCase()}`}>{p.priority}</span>
              </div>
              <p className="project-card-desc">{p.description}</p>
              <div className="project-card-footer">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${p.progress}%`, background: p.color }} />
                </div>
                <span className="progress-label">{p.progress}%</span>
              </div>
              <div className="task-summary">{p.tasks.filter(t => t.done).length}/{p.tasks.length} tasks done</div>
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
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="ai-trigger-sm" onClick={() =>
                  openAI(`Project: ${proj.name}. Status: ${proj.status}. Priority: ${proj.priority}. ${proj.description} Open tasks: ${proj.tasks.filter(t => !t.done).map(t => t.text).join(', ')}`)
                }>✦ AI</button>
                <button onClick={() => deleteProject(proj.id)} style={{ padding: '5px 8px', background: 'var(--red-dim)', color: 'var(--red)', border: '1px solid rgba(255,71,87,.2)', borderRadius: 4, fontSize: 11, cursor: 'pointer' }} title="Delete project">✕</button>
              </div>
            </div>

            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className={`badge ${proj.status === 'Active' ? 'badge--active' : ''}`}>{proj.status}</span>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{completedCount}/{proj.tasks.length}</span>
            </div>

            <div className="task-list">
              {proj.tasks.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label className={`task-item ${t.done ? 'task-item--done' : ''}`} style={{ flex: 1, margin: 0 }}>
                    <input type="checkbox" checked={t.done} onChange={() => toggleTask(proj.id, t.id)} />
                    <span>{t.text}</span>
                  </label>
                  <button onClick={() => deleteTask(proj.id, t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, padding: '2px 4px', opacity: 0.5 }} title="Remove task">✕</button>
                </div>
              ))}

              {/* Add task inline */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  value={newTaskText}
                  onChange={e => setNewTaskText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTask()}
                  placeholder="Add a task… (Enter to save)"
                  style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12 }}
                />
                <button onClick={addTask} style={{ padding: '7px 12px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>+</button>
              </div>
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="progress-bar progress-bar--lg">
                <div className="progress-fill" style={{ width: `${proj.progress}%`, background: proj.color }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
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
