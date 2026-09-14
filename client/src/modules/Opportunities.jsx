import { useCallback, useEffect, useMemo, useState } from 'react';
import { askClaude } from '../api/claude';
import { Button, EmptyState, LoadingRows, PageHeader, Panel, Pill, StateBanner, formatMoney, relativeDate } from '../components/ProductUI';

const VIEWS=[['overview','Overview'],['discover','Discover'],['pipeline','Pipeline'],['applications','Applications'],['watches','Watches']];
const STAGES=['Watching','Qualifying','Pursuing','Drafting','Submitted','Decision','Won','Lost'];
const TYPES=['Role','Consultancy','Tender','Grant','RFP','Framework Agreement','Partnership','Challenge','Programme','Supplier','Other'];
const AUDIENCES=['Jacob','Tuku-Tuku','Both'];
const POSTURES=['Apply','Bid','Recruit Specialists & Bid','Consortium Bid','Consider','No-Bid'];
const EMPTY={title:'',org:'',audience:'Tuku-Tuku',opportunityType:'Consultancy',stage:'Watching',deadline:'',valueAmount:'',currency:'USD',fitScore:0,bidPosture:'Consider',sourceUrl:'',location:'',nextAction:'',notes:'',watchProfileId:''};
const stageTone=s=>s==='Won'?'success':s==='Lost'||s==='Closed'?'danger':s==='Submitted'||s==='Decision'?'info':s==='Pursuing'||s==='Drafting'?'warning':'neutral';
const audienceTone=a=>a==='Jacob'?'info':a==='Tuku-Tuku'?'brand':'neutral';
const fitTone=s=>String(s||'').toLowerCase().includes('strong')?'success':String(s||'').toLowerCase().includes('good')?'brand':String(s||'').toLowerCase().includes('conditional')||String(s||'').toLowerCase().includes('verification')?'warning':String(s||'').toLowerCase().includes('weak')||String(s||'').toLowerCase().includes('not eligible')?'danger':'neutral';
const cleanList=value=>Array.isArray(value)?value.filter(Boolean):[];
const dueSoon=o=>o.deadline&&new Date(o.deadline)>=new Date()&&new Date(o.deadline)<=new Date(Date.now()+14*86400000);
const overdue=o=>o.deadline&&!['Won','Lost','Closed'].includes(o.stage)&&new Date(o.deadline)<new Date();
const score=o=>Number(o.fit_score||0)>0?String(o.fit_score)+'/5':Number(o.relevance_score||0)>0?String(o.relevance_score)+'%':'—';

function OpportunityRow({o,onOpen,onPatch}){
  return <div className="px-list-row">
    <button onClick={()=>onOpen(o)} style={{flex:1,minWidth:0,textAlign:'left',border:0,background:'transparent',cursor:'pointer',padding:0}}>
      <div className="px-list-title">{o.title}</div>
      <div className="px-list-sub">{o.org} · {o.opportunity_type||'Opportunity'}{o.location?' · '+o.location:''}</div>
      <div className="px-task-meta"><Pill tone={audienceTone(o.audience)}>{o.audience}</Pill><Pill tone={fitTone(o.fit_status)}>{o.fit_status||'Needs assessment'}</Pill><Pill tone={stageTone(o.stage)}>{o.stage}</Pill>{o.deadline&&<Pill tone={overdue(o)?'danger':dueSoon(o)?'warning':'neutral'}>{relativeDate(o.deadline)}</Pill>}</div>
    </button>
    <div className="px-list-meta" style={{textAlign:'right'}}><strong>{score(o)}</strong><div>{Number(o.value_amount)>0?formatMoney(o.value_amount,o.currency||'USD'):'Value TBD'}</div></div>
    {o.stage==='Discover'&&<Button variant="tonal" onClick={()=>onPatch(o.id,{stage:'Watching',saved:true,status:'Watching'})}>Watch</Button>}
  </div>;
}

export default function Opportunities({openAI,initialView='overview'}){
  const[data,setData]=useState({opportunities:[],watches:[],proposals:[],sources:[],summary:{}}),[view,setViewState]=useState(initialView),[loading,setLoading]=useState(true),[error,setError]=useState(''),[selected,setSelected]=useState(null),[drawer,setDrawer]=useState(null),[form,setForm]=useState(EMPTY),[saving,setSaving]=useState(false),[proposal,setProposal]=useState(null),[drafting,setDrafting]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const r=await fetch('/api/opportunities?limit=700');if(!r.ok)throw new Error('Opportunity workspace could not be loaded.');setData(await r.json());}
    catch(e){setError(e.message||'Opportunity workspace could not be loaded.');}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{setViewState(initialView);},[initialView]);

  const setView=v=>{setViewState(v);const q=new URLSearchParams({module:'opportunities',view:v});window.history.replaceState({},'','/?'+q.toString());};
  const current=data.opportunities.find(x=>x.id===selected)||null;
  const active=data.opportunities.filter(o=>!['Won','Lost','Closed'].includes(o.stage));
  const discover=data.opportunities.filter(o=>o.stage==='Discover');
  const urgent=active.filter(o=>overdue(o)||dueSoon(o)).sort((a,b)=>new Date(a.deadline)-new Date(b.deadline));
  const highFit=active.filter(o=>Number(o.fit_score||0)>=4||Number(o.relevance_score||0)>=75).sort((a,b)=>Number(b.fit_score||0)-Number(a.fit_score||0));
  const pipelineGroups=useMemo(()=>Object.fromEntries(STAGES.map(s=>[s,data.opportunities.filter(o=>o.stage===s)])),[data.opportunities]);

  const openNew=()=>{setForm(EMPTY);setDrawer('new');};
  const edit=o=>{setForm({...EMPTY,...o,opportunityType:o.opportunity_type||'Consultancy',valueAmount:o.value_amount||'',fitScore:o.fit_score||0,bidPosture:o.bid_posture||'Consider',sourceUrl:o.source_url||'',nextAction:o.next_action||'',watchProfileId:o.watch_profile_id||'',fitStatus:o.fit_status||'Needs assessment',eligibilityStatus:o.eligibility_status||'Needs verification',assessmentStatus:o.assessment_status||'Partial',assessmentConfidence:o.assessment_confidence||'Medium'});setDrawer(o.id);setSelected(o.id);};

  const patch=async(id,updates)=>{
    const r=await fetch('/api/opportunities/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});
    if(!r.ok){const d=await r.json().catch(()=>({}));setError(d.error||'Opportunity could not be updated.');return;}
    await load();
  };

  const save=async()=>{
    if(!form.title.trim()||!form.org.trim())return;
    setSaving(true);
    const payload={...form,valueAmount:Number(form.valueAmount)||0,fitScore:Number(form.fitScore)||0,deadline:form.deadline||null};
    const url=drawer==='new'?'/api/opportunities':'/api/opportunities/'+encodeURIComponent(drawer);
    const r=await fetch(url,{method:drawer==='new'?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)setError(d.error||'Opportunity could not be saved.');
    else{setDrawer(null);await load();setSelected(d.opportunity?.id||selected);}
    setSaving(false);
  };

  const startProposal=async o=>{
    const r=await fetch('/api/opportunities/'+encodeURIComponent(o.id)+'/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:o.title+' — Proposal',client:o.org})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)return setError(d.error||'Proposal could not be created.');
    await load();setProposal(d.proposal);setView('applications');
  };

  const saveProposal=async()=>{
    if(!proposal)return;
    setSaving(true);
    const r=await fetch('/api/opportunities/proposals/'+encodeURIComponent(proposal.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(proposal)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)setError(d.error||'Proposal could not be saved.');
    else{setProposal(d.proposal);await load();}
    setSaving(false);
  };

  const draftProposal=async()=>{
    if(!proposal)return;
    const o=data.opportunities.find(x=>x.id===proposal.opportunity_id);
    if(!o)return;
    setDrafting(true);
    try{
      const context='Opportunity: '+o.title+'. Organisation: '+o.org+'. Type: '+o.opportunity_type+'. Audience: '+o.audience+'. Deadline: '+(o.deadline||'unknown')+'. Fit: '+score(o)+'. Bid posture: '+(o.bid_posture||'unspecified')+'. Next action: '+(o.next_action||'')+'. Notes: '+(o.notes||o.description||'');
      const reply=await askClaude([{role:'user',content:'Draft a concise professional application or proposal structure with: opportunity response, understanding of need, approach, deliverables, timeline, team/evidence placeholders, budget/value only where known, risks/assumptions, and next step. Do not invent credentials, metrics, partners, qualifications or past performance.'}],'opportunities',context);
      setProposal(p=>({...p,content:reply}));
    }catch(e){setError(e.message||'Drafting failed.');}
    setDrafting(false);
  };

  const metrics=<div className="px-metrics">
    <div className="px-metric"><div className="px-metric-value">{data.summary.active??active.length}</div><div className="px-metric-label">Active</div><div className="px-metric-helper">Across Jacob + Tuku-Tuku</div></div>
    <div className="px-metric px-metric--warning"><div className="px-metric-value">{data.summary.due14??urgent.length}</div><div className="px-metric-label">Due / 14d</div><div className="px-metric-helper">Needs action discipline</div></div>
    <div className="px-metric"><div className="px-metric-value">{data.summary.submitted??0}</div><div className="px-metric-label">Submitted / decision</div><div className="px-metric-helper">Awaiting outcome</div></div>
    <div className="px-metric px-metric--success"><div className="px-metric-value">{data.summary.won??0}</div><div className="px-metric-label">Won</div><div className="px-metric-helper">Convert into delivery</div></div>
  </div>;

  const overview=<>{metrics}<div className="px-grid-2">
    <Panel title="Needs attention" subtitle="Deadlines and active pursuits that require a concrete next move.">{loading?<LoadingRows count={5}/>:urgent.length===0?<EmptyState icon="target" title="No urgent opportunity deadlines" body="The active pursuit queue has no deadline inside the next 14 days."/>:<div className="px-list">{urgent.slice(0,10).map(o=><OpportunityRow key={o.id} o={o} onOpen={edit} onPatch={patch}/>)}</div>}</Panel>
    <Panel title="Best current fit" subtitle="High-fit opportunities across the active watch profiles.">{loading?<LoadingRows count={5}/>:highFit.length===0?<EmptyState icon="spark" title="No high-fit records yet" body="Radar and the watch profiles will surface qualified opportunities here."/>:<div className="px-list">{highFit.slice(0,10).map(o=><OpportunityRow key={o.id} o={o} onOpen={edit} onPatch={patch}/>)}</div>}</Panel>
  </div></>;

  const discoverView=<div className="px-grid-2">
    <Panel title="New discoveries" subtitle="Radar findings stay here until you decide to watch, pursue or dismiss them.">{loading?<LoadingRows count={7}/>:discover.length===0?<EmptyState icon="spark" title="No untriaged discoveries" body="All discovered opportunities have been triaged."/>:<div className="px-list">{discover.map(o=><OpportunityRow key={o.id} o={o} onOpen={edit} onPatch={patch}/>)}</div>}</Panel>
    <Panel title="Discovery sources" subtitle="Radar remains a discovery engine; JakeOS owns the opportunity after triage."><div className="px-list">{data.sources.map(s=><div className="px-list-row" key={s.id}><div className="px-list-main"><div className="px-list-title">{s.name}</div><div className="px-list-sub">{s.active?'Active':'Paused'} · last checked {s.last_checked?relativeDate(s.last_checked):'not yet'}</div></div><Pill tone={s.active?'success':'neutral'}>{s.type||'source'}</Pill></div>)}</div></Panel>
  </div>;

  const pipelineView=<div className="pipeline-kanban">{STAGES.map(stage=>{
    const rows=pipelineGroups[stage]||[];
    return <section className="kanban-col" key={stage}>
      <div className="kanban-col-header"><Pill tone={stageTone(stage)}>{stage}</Pill><span className="kanban-count">{rows.length}</span></div>
      <div className="kanban-items">{rows.length===0?<div className="px-empty" style={{padding:'20px 8px'}}><span className="px-kicker">No items</span></div>:rows.map(o=><article className={'kanban-card '+(overdue(o)?'kanban-card--overdue':dueSoon(o)?'kanban-card--due':'')} key={o.id} onClick={()=>edit(o)}>
        <div className="kanban-card-org">{o.org}</div><div className="kanban-card-name">{o.title}</div>
        <div className="px-task-meta"><Pill tone={audienceTone(o.audience)}>{o.audience}</Pill><span>{score(o)}</span></div>
        {o.deadline&&<div className="kanban-card-deadline">{relativeDate(o.deadline)}</div>}
        {o.next_action&&<div className="kanban-card-notes">{o.next_action}</div>}
        <div className="px-between" style={{marginTop:10}}><Pill>{o.opportunity_type}</Pill>{!['Won','Lost'].includes(stage)&&<Button variant="ghost" onClick={e=>{e.stopPropagation();const i=STAGES.indexOf(stage);patch(o.id,{stage:STAGES[Math.min(i+1,STAGES.length-1)]});}}>Advance</Button>}</div>
      </article>)}</div>
    </section>;
  })}</div>;

  const applicationsView=<div className="px-grid-2">
    <Panel title="Application workspace" subtitle="Proposal and application artifacts are attached to the opportunity, not kept as a second pipeline.">{data.proposals.length===0?<EmptyState icon="document" title="No linked applications yet" body="Open a pursuit and start a proposal; it will stay linked to the opportunity lifecycle."/>:<div className="px-list">{data.proposals.map(p=><button className="px-list-row" key={p.id} style={{width:'100%',textAlign:'left',cursor:'pointer'}} onClick={()=>setProposal(p)}><div className="px-list-main"><div className="px-list-title">{p.title}</div><div className="px-list-sub">{p.opportunity_org||p.client||'No organisation'} · {p.opportunity_title||'Standalone proposal'}</div></div><Pill tone={p.status==='Accepted'?'success':p.status==='Sent'?'info':p.status==='Rejected'?'danger':'neutral'}>{p.status}</Pill></button>)}</div>}</Panel>
    <Panel title="Pursuits needing an application" subtitle="Qualified opportunities with no linked proposal yet."><div className="px-list">{data.opportunities.filter(o=>['Pursuing','Drafting','Submitted','Decision'].includes(o.stage)&&Number(o.proposal_count||0)===0).slice(0,20).map(o=><div className="px-list-row" key={o.id}><div className="px-list-main"><div className="px-list-title">{o.title}</div><div className="px-list-sub">{o.org} · {o.stage}</div></div><Button variant="tonal" onClick={()=>startProposal(o)}>Start proposal</Button></div>)}</div></Panel>
  </div>;

  const watchesView=<div className="px-stack">{data.watches.map(w=><Panel key={w.id} title={w.name} subtitle={w.description} actions={<div className="px-row"><Pill tone={audienceTone(w.audience)}>{w.audience}</Pill><Pill tone={w.active?'success':'neutral'}>{w.active?'Active':'Paused'}</Pill></div>}>
    <div className="px-between" style={{marginBottom:12}}><div className="px-kicker">{w.cadence} · {w.active_count||0} active · {w.opportunity_count||0} tracked</div></div>
    <div className="px-list">{data.opportunities.filter(o=>o.watch_profile_id===w.id&&o.stage!=='Closed').slice(0,40).map(o=><OpportunityRow key={o.id} o={o} onOpen={edit} onPatch={patch}/>)}</div>
  </Panel>)}</div>;

  return <div className="module">
    <PageHeader eyebrow="Opportunity management" title="Opportunities" subtitle="Discover, decide, pursue, prepare, submit and convert work from one canonical record." actions={<><Button variant="secondary" icon="spark" onClick={()=>openAI?.('Opportunity workspace: '+active.length+' active, '+urgent.length+' urgent, '+highFit.length+' high-fit. Tell me the three highest-leverage actions.')}>Review</Button><Button icon="plus" onClick={openNew}>Add opportunity</Button></>}/>
    {error&&<StateBanner tone="danger" title="Opportunity workspace needs attention">{error}</StateBanner>}
    <div className="filter-bar" style={{marginBottom:16}}>{VIEWS.map(([id,label])=><button key={id} className={'filter-btn '+(view===id?'filter-btn--active':'')} onClick={()=>setView(id)}>{label}</button>)}</div>
    {view==='overview'?overview:view==='discover'?discoverView:view==='pipeline'?pipelineView:view==='applications'?applicationsView:watchesView}

    {drawer&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&setDrawer(null)}><div className="px-drawer-card">
      <PageHeader eyebrow="Canonical opportunity" title={drawer==='new'?'Add opportunity':form.title||'Edit opportunity'} subtitle="One record owns the opportunity, assessment, pursuit decision, application work and outcome." actions={<button className="px-icon-button" onClick={()=>setDrawer(null)}>×</button>}/>
      {drawer!=='new'&&current&&<div className="px-stack" style={{marginBottom:18}}>
        <Panel title="Fit decision" subtitle="The score shows thematic fit; the status accounts for eligibility, evidence and unresolved blockers.">
          <div className="px-row" style={{flexWrap:'wrap',gap:8,marginBottom:12}}>
            <Pill tone={fitTone(current.fit_status)}>{current.fit_status||'Needs assessment'} · {score(current)}</Pill>
            <Pill tone={fitTone(current.eligibility_status)}>{current.eligibility_status||'Needs verification'}</Pill>
            <Pill tone={current.bid_posture==='No-Bid'?'danger':current.bid_posture?'brand':'neutral'}>{current.bid_posture||'Posture not set'}</Pill>
            <Pill>{current.assessment_status||'Partial'} · {current.assessment_confidence||'Medium'} confidence</Pill>
          </div>
          <div style={{fontSize:14,lineHeight:1.65}}>{current.fit_summary||current.relevance_reason||'This opportunity still needs a deeper fit assessment.'}</div>
          {current.decision_rationale&&<div className="px-banner" style={{marginTop:12}}><strong>Decision rationale</strong><div>{current.decision_rationale}</div></div>}
        </Panel>
        <Panel title="Opportunity brief" subtitle={[current.opportunity_type,current.location,current.arrangement,current.start_window,current.duration].filter(Boolean).join(' · ')||'Scope and timing'}>
          <div style={{fontSize:14,lineHeight:1.7}}>{current.opportunity_summary||current.description||'Detailed opportunity summary has not been captured yet.'}</div>
          <div className="px-row" style={{flexWrap:'wrap',gap:8,marginTop:12}}>
            {current.deadline&&<Pill tone={overdue(current)?'danger':dueSoon(current)?'warning':'neutral'}>Deadline {String(current.deadline).slice(0,10)}</Pill>}
            {current.compensation&&<Pill>{current.compensation}</Pill>}
            {Number(current.value_amount)>0&&<Pill>{formatMoney(current.value_amount,current.currency||'USD')}</Pill>}
            {current.procurement_type&&<Pill>{current.procurement_type}</Pill>}
          </div>
        </Panel>
        <div className="px-grid-2">
          <Panel title="Why it fits" subtitle="Verified or evidence-backed matches to the opportunity.">
            {cleanList(current.strongest_matches).length?<ul style={{margin:'0 0 0 18px',padding:0,lineHeight:1.7}}>{cleanList(current.strongest_matches).map((x,i)=><li key={i}>{typeof x==='string'?x:(x.label||x.text||JSON.stringify(x))}</li>)}</ul>:<div className="px-list-sub">No structured fit evidence captured yet.</div>}
          </Panel>
          <Panel title="Mandatory requirements" subtitle="Requirements that determine eligibility, not just attractiveness.">
            {cleanList(current.mandatory_requirements).length?<ul style={{margin:'0 0 0 18px',padding:0,lineHeight:1.7}}>{cleanList(current.mandatory_requirements).map((x,i)=><li key={i}>{typeof x==='string'?x:(x.label||x.text||JSON.stringify(x))}</li>)}</ul>:<div className="px-list-sub">Mandatory requirements have not been fully extracted yet.</div>}
          </Panel>
        </div>
        <div className="px-grid-2">
          <Panel title="Gaps & blockers" subtitle="What must be resolved before applying or bidding.">
            {cleanList([...(current.gaps||[]),...(current.hard_blockers||[])]).length?<ul style={{margin:'0 0 0 18px',padding:0,lineHeight:1.7}}>{cleanList([...(current.gaps||[]),...(current.hard_blockers||[])]).map((x,i)=><li key={i}>{typeof x==='string'?x:(x.label||x.text||JSON.stringify(x))}</li>)}</ul>:<div className="px-list-sub">No material blocker is recorded.</div>}
          </Panel>
          <Panel title="Scope / deliverables" subtitle="What the assignment expects to be delivered.">
            {cleanList(current.deliverables).length?<ul style={{margin:'0 0 0 18px',padding:0,lineHeight:1.7}}>{cleanList(current.deliverables).map((x,i)=><li key={i}>{typeof x==='string'?x:(x.label||x.text||JSON.stringify(x))}</li>)}</ul>:<div className="px-list-sub">Deliverables have not been fully extracted yet.</div>}
          </Panel>
        </div>
        <div className="px-grid-2">
          <Panel title="Application requirements" subtitle="What must be prepared or submitted.">
            {cleanList(current.application_requirements).length?<ul style={{margin:'0 0 0 18px',padding:0,lineHeight:1.7}}>{cleanList(current.application_requirements).map((x,i)=><li key={i}>{typeof x==='string'?x:(x.label||x.text||JSON.stringify(x))}</li>)}</ul>:<div className="px-list-sub">Application requirements have not been fully extracted yet.</div>}
          </Panel>
          <Panel title="Winning strategy" subtitle="Recommended pursuit approach based on fit and gaps.">
            <div style={{fontSize:14,lineHeight:1.7}}>{current.winning_strategy||current.next_action||'No pursuit strategy has been recorded yet.'}</div>
            {cleanList(current.strategic_reasons).length>0&&<ul style={{margin:'12px 0 0 18px',padding:0,lineHeight:1.7}}>{cleanList(current.strategic_reasons).map((x,i)=><li key={i}>{typeof x==='string'?x:(x.label||x.text||JSON.stringify(x))}</li>)}</ul>}
          </Panel>
        </div>
        <Panel title="Source & verification" subtitle={current.source_verified_at?'Source verified '+relativeDate(current.source_verified_at):'Source verification not yet recorded'}>
          <div className="px-between"><div><strong>{current.source||'Unknown source'}</strong><div className="px-list-sub">{current.source_context||'No source notes captured.'}</div></div>{current.source_url&&<Button variant="secondary" onClick={()=>window.open(current.source_url,'_blank','noopener')}>Open original source</Button>}</div>
        </Panel>
      </div>}
      <div className="px-stack">
        <div className="px-form-grid"><div className="px-field"><label>Title</label><input autoFocus value={form.title||''} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div><div className="px-field"><label>Organisation</label><input value={form.org||''} onChange={e=>setForm(f=>({...f,org:e.target.value}))}/></div></div>
        <div className="px-form-grid"><div className="px-field"><label>For</label><select value={form.audience||'Tuku-Tuku'} onChange={e=>setForm(f=>({...f,audience:e.target.value}))}>{AUDIENCES.map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Type</label><select value={form.opportunityType||'Consultancy'} onChange={e=>setForm(f=>({...f,opportunityType:e.target.value}))}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></div></div>
        <div className="px-form-grid"><div className="px-field"><label>Stage</label><select value={form.stage||'Watching'} onChange={e=>setForm(f=>({...f,stage:e.target.value}))}>{['Discover',...STAGES,'Closed'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Deadline</label><input type="date" value={form.deadline?String(form.deadline).slice(0,10):''} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))}/></div></div>
        <div className="px-form-grid"><div className="px-field"><label>Fit score</label><select value={form.fitScore??0} onChange={e=>setForm(f=>({...f,fitScore:Number(e.target.value)}))}>{[0,1,2,3,4,5].map(x=><option key={x} value={x}>{x===0?'Not scored':String(x)+'/5'}</option>)}</select></div><div className="px-field"><label>Fit status</label><select value={form.fitStatus||'Needs assessment'} onChange={e=>setForm(f=>({...f,fitStatus:e.target.value}))}>{['Needs assessment','Strong fit','Good fit','Conditional fit','Weak fit','Not eligible'].map(x=><option key={x}>{x}</option>)}</select></div></div>
        <div className="px-form-grid"><div className="px-field"><label>Eligibility status</label><select value={form.eligibilityStatus||'Needs verification'} onChange={e=>setForm(f=>({...f,eligibilityStatus:e.target.value}))}>{['Needs verification','Eligible','Likely eligible','Conditional','Not eligible'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Bid / application posture</label><select value={form.bidPosture||'Consider'} onChange={e=>setForm(f=>({...f,bidPosture:e.target.value}))}>{POSTURES.map(x=><option key={x}>{x}</option>)}</select></div></div>
        <div className="px-form-grid"><div className="px-field"><label>Value</label><input type="number" min="0" value={form.valueAmount||''} onChange={e=>setForm(f=>({...f,valueAmount:e.target.value}))}/></div><div className="px-field"><label>Currency</label><select value={form.currency||'USD'} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>{['USD','UGX','EUR','GBP','KES'].map(x=><option key={x}>{x}</option>)}</select></div></div>
        <div className="px-field"><label>Watch profile</label><select value={form.watchProfileId||''} onChange={e=>setForm(f=>({...f,watchProfileId:e.target.value}))}><option value="">None / manual</option>{data.watches.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
        <div className="px-field"><label>Source URL</label><input value={form.sourceUrl||''} onChange={e=>setForm(f=>({...f,sourceUrl:e.target.value}))}/></div>
        <div className="px-field"><label>Location</label><input value={form.location||''} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/></div>
        <div className="px-field"><label>Next action</label><textarea value={form.nextAction||''} onChange={e=>setForm(f=>({...f,nextAction:e.target.value}))}/></div>
        <div className="px-field"><label>Notes / evidence</label><textarea style={{minHeight:140}} value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
      </div>
      <div className="px-form-actions">{drawer!=='new'&&current&&<><Button variant="tonal" onClick={()=>startProposal(current)}>Start proposal</Button>{current.source_url&&<Button variant="secondary" onClick={()=>window.open(current.source_url,'_blank','noopener')}>Open source</Button>}</>}<span style={{flex:1}}/><Button variant="secondary" onClick={()=>setDrawer(null)}>Cancel</Button><Button disabled={saving} onClick={save}>{saving?'Saving…':'Save'}</Button></div>
    </div></div>}

    {proposal&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&setProposal(null)}><div className="px-drawer-card">
      <PageHeader eyebrow="Application artifact" title={proposal.title||'Proposal'} subtitle={proposal.opportunity_title||proposal.client||'Linked opportunity'} actions={<button className="px-icon-button" onClick={()=>setProposal(null)}>×</button>}/>
      <div className="px-stack"><div className="px-form-grid"><div className="px-field"><label>Status</label><select value={proposal.status||'Draft'} onChange={e=>setProposal(p=>({...p,status:e.target.value}))}>{['Draft','Sent','Accepted','Rejected'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Type</label><input value={proposal.type||''} onChange={e=>setProposal(p=>({...p,type:e.target.value}))}/></div></div><div className="px-field"><label>Content</label><textarea style={{minHeight:'52vh'}} value={proposal.content||''} onChange={e=>setProposal(p=>({...p,content:e.target.value}))}/></div></div>
      <div className="px-form-actions"><Button variant="tonal" icon="spark" disabled={drafting} onClick={draftProposal}>{drafting?'Drafting…':'Draft with Jake'}</Button><span style={{flex:1}}/><Button variant="secondary" onClick={()=>setProposal(null)}>Close</Button><Button disabled={saving} onClick={saveProposal}>{saving?'Saving…':'Save application'}</Button></div>
    </div></div>}
  </div>;
}
