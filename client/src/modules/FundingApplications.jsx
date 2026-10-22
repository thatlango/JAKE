import {useEffect,useState} from 'react';
const statuses=['discovered','assessing','draft','internal_review','ready','submitted_unverified','submitted_verified','under_review','shortlisted','awarded','rejected','withdrawn','missed'];
const labels={submitted_unverified:'Submission unverified',submitted_verified:'Submitted — verified',internal_review:'Internal review',under_review:'Under review'};
const blank={title:'',funder:'',initiative:'',owner:'',deadline:'',status:'draft',next_action:'',submission_channel:'',submission_reference:'',receipt_url:'',submitted_at:''};
export default function FundingApplications(){
 const[items,setItems]=useState([]),[form,setForm]=useState(blank),[active,setActive]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[filter,setFilter]=useState('');
 const refresh=async()=>{const r=await fetch('/api/funding/applications',{credentials:'same-origin'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load applications');setItems(d.applications||[]);};
 useEffect(()=>{refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const save=async e=>{e.preventDefault();setBusy(true);setError('');try{const payload={...form,deadline:form.deadline?new Date(form.deadline).toISOString():null,submitted_at:form.submitted_at?new Date(form.submitted_at).toISOString():null};const r=await fetch('/api/funding/applications'+(active?'/'+active:''),{method:active?'PATCH':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not save');await refresh();setActive(null);setForm(blank);}catch(ex){setError(ex.message);}finally{setBusy(false);}};
 const edit=a=>{setActive(a.id);setForm({...blank,...Object.fromEntries(Object.keys(blank).map(k=>[k,a[k]??''])),deadline:a.deadline?a.deadline.slice(0,16):'',submitted_at:a.submitted_at?a.submitted_at.slice(0,16):''});window.scrollTo({top:0,behavior:'smooth'});};
 return <section className="px-stack" aria-label="Funding and applications tracker">
 <header><h1>Funding & Applications</h1><p>Track every funding opportunity from discovery to verified submission and decision.</p></header>
 {error&&<p role="alert" className="px-banner px-banner--danger">{error}</p>}
 <form className="px-stack px-card" onSubmit={save}>
 <h2>{active?'Update application':'New application'}</h2>
 <div className="px-grid">{[['title','Application title'],['funder','Funder'],['initiative','Product or initiative'],['owner','Responsible owner'],['next_action','Next action']].map(([key,label])=><label key={key} className="px-field">{label}<input value={form[key]} required={key==='title'} maxLength={key==='title'?300:1000} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
 <label className="px-field">Deadline <input type="datetime-local" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></label>
 <label className="px-field">Status <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(s=><option key={s} value={s}>{labels[s]||s.replaceAll('_',' ')}</option>)}</select></label>
 <label className="px-field">Submission date <input type="datetime-local" value={form.submitted_at} onChange={e=>setForm({...form,submitted_at:e.target.value})}/></label>
 {['submission_channel','submission_reference','receipt_url'].map(k=><label key={k} className="px-field">{k.replaceAll('_',' ')} <input type={k==='receipt_url'?'url':'text'} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}</div>
 <p>Verified submission requires a date, channel, and confirmation reference or secure receipt link.</p>
 <div><button type="submit" disabled={busy}>{busy?'Saving…':active?'Save changes':'Add application'}</button> {active&&<button type="button" onClick={()=>{setActive(null);setForm(blank);}}>Cancel</button>}</div>
 </form>
 <div><label>Filter by status <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All applications</option>{statuses.map(s=><option key={s} value={s}>{labels[s]||s.replaceAll('_',' ')}</option>)}</select></label></div>
 {loading?<p>Loading applications…</p>:<div className="px-stack">{items.filter(a=>!filter||a.status===filter).map(a=><article className="px-card" key={a.id}><h3>{a.title}</h3><p>{a.funder||'Funder not set'} · {labels[a.status]||a.status.replaceAll('_',' ')}</p><p>Deadline: {a.deadline?new Date(a.deadline).toLocaleString():'Not set'} · Owner: {a.owner||'Unassigned'}</p><p>Next: {a.next_action||'No action assigned'}</p><button type="button" onClick={()=>edit(a)}>Review / edit</button></article>)}{items.length===0&&<p>No applications yet. Add the first funding call above.</p>}</div>}
 </section>;
}