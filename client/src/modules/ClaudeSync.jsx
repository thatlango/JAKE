import { useState, useEffect } from 'react';

const CONTEXT_TYPES = ['System Prompt', 'Project Notes', 'Background Knowledge', 'Instructions', 'Reference'];

function useLocalContexts() {
  const [contexts, setContexts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jake_claude_contexts') || '[]'); }
    catch { return []; }
  });
  useEffect(() => { localStorage.setItem('jake_claude_contexts', JSON.stringify(contexts)); }, [contexts]);
  return [contexts, setContexts];
}

function ContextCard({ ctx, onDelete, onUseAsContext, openAI }) {
  const [expanded, setExpanded] = useState(false);
  const preview = ctx.content.length > 200 ? ctx.content.slice(0, 200) + '…' : ctx.content;
  const wordCount = ctx.content.split(/\s+/).filter(Boolean).length;

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{ctx.emoji || '🧠'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{ctx.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            <span style={{ background: 'var(--accent-dim)', color: 'var(--accent)', padding: '1px 6px', borderRadius: 3, fontWeight: 600, marginRight: 6 }}>{ctx.type}</span>
            {ctx.project && <span style={{ color: 'var(--blue)', marginRight: 6 }}>◈ {ctx.project}</span>}
            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{wordCount} words</span>
            <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>{new Date(ctx.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => openAI(`Context loaded: "${ctx.name}"\n\n${ctx.content.slice(0, 2000)}`)}
            style={{ padding: '5px 10px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>
            ✦ Ask AI
          </button>
          <button onClick={onDelete} style={{ padding: '5px 8px', background: 'var(--red-dim)', border: '1px solid rgba(255,71,87,.2)', borderRadius: 5, fontSize: 11, color: 'var(--red)', cursor: 'pointer' }}>✕</button>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, fontFamily: 'DM Sans, sans-serif' }}>
        {expanded ? ctx.content : preview}
      </div>

      {ctx.content.length > 200 && (
        <button onClick={() => setExpanded(e => !e)} style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--blue)', fontSize: 11, cursor: 'pointer', padding: 0 }}>
          {expanded ? '↑ Collapse' : '↓ Show full context'}
        </button>
      )}

      {ctx.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          {ctx.tags.map(t => (
            <span key={t} style={{ fontSize: 10, background: 'var(--surface-3)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 10 }}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClaudeSync({ openAI, projects = [] }) {
  const [contexts, setContexts] = useLocalContexts();
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('All');
  const [form, setForm] = useState({
    name: '', emoji: '🧠', type: 'System Prompt', project: '',
    content: '', tags: '',
  });

  const projectNames = ['All', ...new Set([
    ...projects.map(p => p.name),
    ...contexts.map(c => c.project).filter(Boolean),
  ])];

  const importContext = () => {
    if (!form.name.trim() || !form.content.trim()) return;
    const ctx = {
      id: `ctx_${Date.now()}`,
      name: form.name.trim(),
      emoji: form.emoji || '🧠',
      type: form.type,
      project: form.project.trim(),
      content: form.content.trim(),
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
    };
    setContexts(prev => [ctx, ...prev]);
    setForm({ name: '', emoji: '🧠', type: 'System Prompt', project: '', content: '', tags: '' });
    setShowImport(false);
  };

  const deleteContext = (id) => {
    if (!confirm('Delete this context?')) return;
    setContexts(prev => prev.filter(c => c.id !== id));
  };

  const filteredContexts = contexts.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.content.toLowerCase().includes(search.toLowerCase());
    const matchProject = filterProject === 'All' || c.project === filterProject;
    return matchSearch && matchProject;
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Claude Context Sync</h1>
          <p className="module-sub">
            {contexts.length} contexts stored · Import project prompts, instructions, and knowledge
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ai-trigger-sm" onClick={() => setShowImport(s => !s)}>+ Import Context</button>
          <button className="ai-trigger" onClick={() => openAI(`I have ${contexts.length} Claude project contexts stored. Recent: ${contexts.slice(0, 3).map(c => c.name).join(', ')}. How can I best use these contexts to advance my work?`)}>✦ Ask AI</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card stat-card--green"><div className="stat-value">{contexts.length}</div><div className="stat-label">Contexts</div></div>
        <div className="stat-card"><div className="stat-value">{new Set(contexts.map(c => c.project).filter(Boolean)).size}</div><div className="stat-label">Projects</div></div>
        <div className="stat-card stat-card--amber"><div className="stat-value">{contexts.filter(c => c.type === 'System Prompt').length}</div><div className="stat-label">System Prompts</div></div>
        <div className="stat-card"><div className="stat-value">{contexts.reduce((sum, c) => sum + c.content.split(/\s+/).filter(Boolean).length, 0).toLocaleString()}</div><div className="stat-label">Total Words</div></div>
      </div>

      {/* Import form */}
      {showImport && (
        <div style={{ margin: '0 28px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Import Claude Context</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Paste your Claude project system prompt, instructions, or any knowledge base content to keep it accessible in JAKE.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Context name *"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={form.emoji} onChange={e => set('emoji', e.target.value)} placeholder="Emoji"
                style={{ width: 56, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 16, textAlign: 'center' }} />
              <select value={form.type} onChange={e => set('type', e.target.value)}
                style={{ flex: 1, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }}>
                {CONTEXT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <input value={form.project} onChange={e => set('project', e.target.value)} placeholder="Associated project (optional)"
              list="project-suggestions"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
            <datalist id="project-suggestions">
              {projects.map(p => <option key={p.id} value={p.name} />)}
            </datalist>
            <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="Tags (comma-separated)"
              style={{ background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }} />
          </div>
          <textarea
            value={form.content}
            onChange={e => set('content', e.target.value)}
            placeholder="Paste your Claude project context, system prompt, instructions, or notes here…"
            style={{ width: '100%', marginTop: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px', color: 'var(--text)', fontSize: 13, minHeight: 160, resize: 'vertical', fontFamily: 'DM Sans, sans-serif', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={importContext} style={{ flex: 1, padding: '9px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne,sans-serif' }}>Save Context</button>
            <button onClick={() => setShowImport(false)} style={{ padding: '9px 14px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div style={{ padding: '0 28px 12px', display: 'flex', gap: 8 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contexts…"
          style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 13 }}
        />
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }}>
          {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div style={{ padding: '0 28px 20px' }}>
        {filteredContexts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            {contexts.length === 0 ? (
              <>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No contexts yet</div>
                <div style={{ fontSize: 13 }}>
                  Import your Claude project system prompts, instructions, or knowledge bases to keep everything in one place.
                </div>
                <button onClick={() => setShowImport(true)} style={{ marginTop: 16, padding: '9px 20px', background: 'var(--accent)', color: '#07090F', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Syne,sans-serif' }}>
                  + Import First Context
                </button>
              </>
            ) : (
              <div style={{ fontSize: 13 }}>No contexts match your search.</div>
            )}
          </div>
        )}
        {filteredContexts.map(ctx => (
          <ContextCard
            key={ctx.id}
            ctx={ctx}
            onDelete={() => deleteContext(ctx.id)}
            onUseAsContext={() => openAI(`Using context: "${ctx.name}"\n\n${ctx.content}`)}
            openAI={openAI}
          />
        ))}
      </div>

      {/* How-to guide */}
      {contexts.length === 0 && !showImport && (
        <div style={{ margin: '0 28px 20px', background: 'var(--surface-2)', border: '1px solid rgba(94,106,210,.2)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--blue)' }}>🔗 How to sync Claude project contexts</div>
          <ol style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 2, paddingLeft: 16, margin: 0 }}>
            <li>Go to <strong>claude.ai</strong> → open any Project</li>
            <li>Copy the <strong>system prompt</strong> or any project instructions</li>
            <li>Click <strong>+ Import Context</strong> above and paste it in</li>
            <li>Tag it to a JAKE project for easy filtering</li>
            <li>Use <strong>✦ Ask AI</strong> to have Claude work with that context directly</li>
          </ol>
        </div>
      )}
    </div>
  );
}
