import { useState, useRef, useEffect } from 'react';
import { askClaude } from '../api/claude';

const CATEGORIES = ['Income','Food','Transport','Housing','Utilities','Health','Education','Entertainment','Business','Other'];

export default function VoiceMemo({ projects, pipeline, setCalendar, openAI }) {
  const [recording, setRecording]   = useState(false);
  const [seconds,   setSeconds]     = useState(0);
  const [transcript,setTranscript]  = useState('');
  const [parsed,    setParsed]      = useState(null);
  const [busy,      setBusy]        = useState(false);
  const [status,    setStatus]      = useState('idle'); // idle|recording|transcribing|parsing|done|error
  const [message,   setMessage]     = useState('');
  const [confirmed, setConfirmed]   = useState({});
  const [addedCount,setAddedCount]  = useState(0);

  const mediaRef  = useRef(null);
  const chunksRef = useRef([]);
  const timerRef  = useRef(null);

  useEffect(() => () => { clearInterval(timerRef.current); mediaRef.current?.stream?.getTracks().forEach(t=>t.stop()); }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(200);
      mediaRef.current = mr;
      setRecording(true);
      setSeconds(0);
      setStatus('recording');
      setTranscript('');
      setParsed(null);
      setConfirmed({});
      setAddedCount(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setStatus('error');
      setMessage('Microphone access denied. Allow microphone in browser settings.');
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    const mr = mediaRef.current;
    if (!mr) return;
    mr.onstop = () => transcribeAudio(chunksRef.current, mr.mimeType);
    mr.stop();
    mr.stream.getTracks().forEach(t => t.stop());
    setRecording(false);
    setStatus('transcribing');
  };

  const transcribeAudio = async (chunks, mimeType) => {
    const blob = new Blob(chunks, { type: mimeType });
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      try {
        const res = await fetch('/api/groq/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64, mimeType, filename: 'memo.webm' }),
        });
        const data = await res.json();
        if (!res.ok) { setStatus('error'); setMessage(data.error || 'Transcription failed'); return; }
        setTranscript(data.text || '');
        parseTranscript(data.text || '');
      } catch(e) { setStatus('error'); setMessage(e.message); }
    };
    reader.readAsDataURL(blob);
  };

  const parseTranscript = async (text) => {
    if (!text.trim()) { setStatus('done'); return; }
    setStatus('parsing');
    const projectNames = (projects||[]).map(p=>p.name).join(', ');
    const result = await askClaude([{ role:'user', content:
      `Parse this voice memo transcript and extract actionable items. Return ONLY valid JSON (no markdown, no backticks):\n\n"${text}"\n\nExtract into this exact structure:\n{\n  "tasks": [{"text":"task description","project":"project name or null","priority":"high|medium|low"}],\n  "events": [{"title":"event name","date":"YYYY-MM-DD or null","notes":""}],\n  "contacts": [{"name":"person name","action":"what to do","notes":"context"}],\n  "deals": [{"name":"deal name","org":"organisation","notes":"context"}],\n  "summary": "1-sentence summary of the memo"\n}\n\nKnown projects: ${projectNames||'none'}. Today is ${new Date().toISOString().slice(0,10)}. If something is not found, return empty array. Return only JSON.`
    }], 'projects');

    try {
      const jsonStr = typeof result === 'string'
        ? result.replace(/```json?\n?/g,'').replace(/```/g,'').trim()
        : '{}';
      const data = JSON.parse(jsonStr);
      setParsed(data);
      // Pre-confirm all items
      const init = {};
      (data.tasks||[]).forEach((_,i)    => { init[`task_${i}`]    = true; });
      (data.events||[]).forEach((_,i)   => { init[`event_${i}`]   = true; });
      (data.contacts||[]).forEach((_,i) => { init[`contact_${i}`] = true; });
      (data.deals||[]).forEach((_,i)    => { init[`deal_${i}`]    = true; });
      setConfirmed(init);
      setStatus('done');
    } catch {
      setStatus('done');
      setMessage('Could not parse memo structure — see transcript below.');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('transcribing');
    setTranscript('');
    setParsed(null);
    setConfirmed({});
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      try {
        const res = await fetch('/api/groq/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64, mimeType: file.type, filename: file.name }),
        });
        const data = await res.json();
        if (!res.ok) { setStatus('error'); setMessage(data.error || 'Transcription failed'); return; }
        setTranscript(data.text || '');
        parseTranscript(data.text || '');
      } catch(e) { setStatus('error'); setMessage(e.message); }
    };
    reader.readAsDataURL(file);
  };

  const addItems = () => {
    let count = 0;
    if (parsed?.tasks) {
      parsed.tasks.forEach((_t, i) => {
        if (!confirmed[`task_${i}`]) return;
        count++;
      });
    }
    if (parsed?.events) {
      parsed.events.forEach((e, i) => {
        if (!confirmed[`event_${i}`] || !e.date) return;
        setCalendar(prev => [...prev, {
          id: `ev_${Date.now()}_${i}`,
          title: e.title,
          date: e.date,
          type: 'session',
          project: 'Voice Memo',
          done: false,
          notes: e.notes || '',
        }]);
        count++;
      });
    }
    setAddedCount(count);
    setMessage(`✅ Added ${count} item${count!==1?'s':''} to JAKE`);
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const tog = (key) => setConfirmed(c => ({...c,[key]:!c[key]}));

  const IDLE   = status === 'idle';
  const BUSY   = ['transcribing','parsing'].includes(status);
  const DONE   = status === 'done';
  const ERR    = status === 'error';

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Voice Memo</h1>
          <p className="module-sub">Record or upload · AI transcribes & extracts tasks, events, contacts</p>
        </div>
        <button className="ai-trigger" onClick={() => openAI('I want to capture thoughts quickly and turn them into actionable items.')}>✦ Ask AI</button>
      </div>

      <div className="module-body">
        {/* Recorder */}
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-header">Record or Upload Audio</div>
          <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            {!recording ? (
              <button onClick={startRecording} disabled={BUSY}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'var(--red)', color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:14, cursor: BUSY?'not-allowed':'pointer', fontFamily:'Syne,sans-serif' }}>
                🎙 Start Recording
              </button>
            ) : (
              <button onClick={stopRecording}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 20px', background:'var(--surface-3)', color:'var(--red)', border:'2px solid var(--red)', borderRadius:999, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'Syne,sans-serif', animation:'pulse 1s infinite' }}>
                ⏹ Stop · {fmt(seconds)}
              </button>
            )}

            <label style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:999, fontSize:13, color:'var(--text-muted)', cursor:'pointer' }}>
              📂 Upload Audio
              <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ display:'none' }} />
            </label>

            {BUSY && (
              <span style={{ fontSize:12, color:'var(--blue)', fontWeight:600 }}>
                {status === 'transcribing' ? '🎙 Transcribing with Groq Whisper…' : '🧠 Parsing with Claude…'}
              </span>
            )}
          </div>
          <div style={{ marginTop:10, fontSize:11, color:'var(--text-dim)' }}>
            Free tier: Groq Whisper (25h audio/day) · Max ~3 min per memo for best results
          </div>
        </div>

        {(ERR || message) && !addedCount && (
          <div style={{ padding:'10px 14px', background: ERR?'var(--red-dim)':'var(--green-dim)', border:`1px solid ${ERR?'rgba(255,71,87,.2)':'rgba(14,203,129,.2)'}`, borderRadius:8, fontSize:13, color: ERR?'var(--red)':'var(--green)', marginBottom:12 }}>
            {ERR ? `⚠ ${message}` : message}
          </div>
        )}

        {transcript && (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-header">Transcript</div>
            <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.75, whiteSpace:'pre-wrap' }}>{transcript}</p>
          </div>
        )}

        {DONE && parsed && (
          <div className="card">
            <div className="card-header">
              Extracted Items
              {parsed.summary && <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:400, textTransform:'none', letterSpacing:0, marginLeft:8 }}>— {parsed.summary}</span>}
            </div>

            {['tasks','events','contacts','deals'].map(type => {
              const items = parsed[type] || [];
              if (!items.length) return null;
              const labels = { tasks:'Tasks', events:'Calendar Events', contacts:'CRM Follow-ups', deals:'Pipeline Deals' };
              const icons  = { tasks:'☑', events:'📅', contacts:'👤', deals:'📊' };
              return (
                <div key={type} style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:8 }}>
                    {icons[type]} {labels[type]}
                  </div>
                  {items.map((item, i) => {
                    const key = `${type.slice(0,-1)}_${i}`;
                    const label = item.text || item.title || `${item.name}${item.action?' — '+item.action:''}`;
                    return (
                      <div key={key} className="task-item" style={{ padding:'8px 6px', borderRadius:6 }} onClick={()=>tog(key)}>
                        <input type="checkbox" checked={confirmed[key]||false} readOnly
                          style={{ width:15, height:15, accentColor:'var(--accent)', flexShrink:0 }} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, color:'var(--text)' }}>{label}</div>
                          {(item.project||item.date||item.notes) && (
                            <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                              {item.project && <span>📁 {item.project} · </span>}
                              {item.date    && <span>📅 {item.date} · </span>}
                              {item.notes   && item.notes}
                            </div>
                          )}
                        </div>
                        {item.priority && (
                          <span className={`priority priority--${item.priority}`}>{item.priority}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <button onClick={addItems} disabled={!Object.values(confirmed).some(Boolean)}
              style={{ width:'100%', padding:10, background:'var(--accent)', color:'#07090F', border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'Syne,sans-serif', marginTop:4 }}>
              Add Selected to JAKE
            </button>
            {addedCount > 0 && (
              <div style={{ textAlign:'center', marginTop:8, fontSize:12, color:'var(--green)' }}>
                ✅ {message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
