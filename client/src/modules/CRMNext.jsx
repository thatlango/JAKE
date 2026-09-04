import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, LoadingRows, PageHeader, Panel, Pill, StateBanner, formatDate, relativeDate } from '../components/ProductUI';

const TYPES=['All','Active','Partner','Client','Prospect','Funder'];
const INTERACTION_TYPES=['note','call','email','meeting','proposal','payment'];
const EMPTY_CLIENT={name:'',org:'',role:'',email:'',phone:'',location:'',type:'Partner',status:'Active',notes:'',avatar_emoji:'👤'};
const EMPTY_INTERACTION={type:'note',title:'',content:'',date:new Date().toISOString().slice(0,10),outcome:'',follow_up_date:'',follow_up_note:'',amount:'',currency:'UGX',method:'Mobile Money',reference:'',payment_status:'Received'};

const daysSince=value=>{if(!value)return null;const d=new Date(value);if(Number.isNaN(d.getTime()))return null;return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));};
const contactState=client=>{
  if(client.next_followup&&new Date(client.next_followup)<=new Date())return {label:'Follow-up due',tone:'danger',weight:0};
  const age=daysSince(client.last_contact);
  if(age===null)return {label:'No contact yet',tone:'danger',weight:1};
  if(age>30)return {label:`${age}d since contact`,tone:'warning',weight:2};
  if(age<=7)return {label:age===0?'Contacted today':`${age}d since contact`,tone:'success',weight:4};
  return {label:`${age}d since contact`,tone:'neutral',weight:3};
};
const typeTone=type=>type==='Client'?'brand':type==='Prospect'?'warning':type==='Funder'?'info':'neutral';
const interactionIcon=type=>({call:'users',email:'document',meeting:'calendar',proposal:'document',payment:'money',note:'document'}[type]||'document');

export default function CRMNext({openAI}){
  const[clients,setClients]=useState([]),[stats,setStats]=useState({}),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null);
  const[filter,setFilter]=useState('All'),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false),[error,setError]=useState('');
  const[drawer,setDrawer]=useState(null),[clientForm,setClientForm]=useState(EMPTY_CLIENT),[interactionForm,setInteractionForm]=useState(EMPTY_INTERACTION),[saving,setSaving]=useState(false);

  const load=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch('/api/crm/clients');if(!r.ok)throw new Error('Relationship data could not be loaded.');const d=await r.json();setClients(d.clients||[]);setStats(d.stats||{});setSelected(s=>s||(d.clients?.[0]?.id??null));}catch(e){setError(e.message||'Relationship data could not be loaded.');}setLoading(false);},[]);
  const loadDetail=useCallback(async id=>{if(!id){setDetail(null);return;}setDetailLoading(true);try{const r=await fetch(`/api/crm/clients/${encodeURIComponent(id)}`);if(!r.ok)throw new Error('Relationship detail could not be loaded.');const d=await r.json();setDetail(d.client||null);}catch(e){setError(e.message||'Relationship detail could not be loaded.');}setDetailLoading(false);},[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{loadDetail(selected);},[selected,loadDetail]);

  const filtered=useMemo(()=>clients.filter(c=>{
    const matchFilter=filter==='All'||c.type===filter||c.status===filter;
    const q=query.trim().toLowerCase();
    const matchQuery=!q||[c.name,c.org,c.role,c.email,c.phone].some(v=>String(v||'').toLowerCase().includes(q));
    return matchFilter&&matchQuery;
  }).sort((a,b)=>contactState(a).weight-contactState(b).weight||String(a.name||'').localeCompare(String(b.name||''))),[clients,filter,query]);
  const attention=useMemo(()=>clients.filter(c=>contactState(c).weight<=2),[clients]);
  const touched7d=Number(stats.interactions7d||0);

  const openNewClient=()=>{setClientForm(EMPTY_CLIENT);setDrawer('client');};
  const saveClient=async()=>{if(!clientForm.name.trim())return;setSaving(true);setError('');try{const r=await fetch('/api/crm/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...clientForm,name:clientForm.name.trim()})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not save relationship.');setDrawer(null);setClientForm(EMPTY_CLIENT);await load();if(d.client?.id)setSelected(d.client.id);}catch(e){setError(e.message||'Could not save relationship.');}setSaving(false);};
  const saveInteraction=async()=>{if(!selected)return;const f=interactionForm;if(f.type!=='payment'&&!f.content.trim())return;if(f.type==='payment'&&!f.amount)return;setSaving(true);setError('');try{const content=f.type==='payment'?JSON.stringify({amount:Number(f.amount),currency:f.currency,method:f.method,reference:f.reference,status:f.payment_status}):f.content;const title=f.type==='payment'?(f.title||`Payment — ${f.currency} ${Number(f.amount).toLocaleString()}`):f.title;const r=await fetch(`/api/crm/clients/${encodeURIComponent(selected)}/interactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:f.type,title,content,date:f.date,outcome:f.outcome,follow_up_date:f.follow_up_date||null,follow_up_note:f.follow_up_note})});if(!r.ok)throw new Error('Could not record interaction.');setDrawer(null);setInteractionForm(EMPTY_INTERACTION);await Promise.all([load(),loadDetail(selected)]);}catch(e){setError(e.message||'Could not record interaction.');}setSaving(false);};

  const askAboutClient=()=>{if(!detail)return;const recent=(detail.interactions||[]).filter(i=>i.type!=='payment').slice(0,4).map(i=>`${i.date}: ${i.type} — ${i.title||i.content||''}`).join('\n');openAI(`Relationship review for ${detail.name}${detail.org?` at ${detail.org}`:''}. Type ${detail.type}. Last contact ${detail.last_contact||'never'}. Next follow-up ${detail.next_followup||'none'}. Recent interactions:\n${recent||'No interactions recorded.'}\nTell me the relationship state, the next move, any risk of going cold, and draft a concise follow-up if useful.`);};

  const state=detail?contactState(detail):null;
  const nonPayments=(detail?.interactions||[]).filter(i=>i.type!=='payment');
  const payments=(detail?.interactions||[]).filter(i=>i.type==='payment');

  return <div className="module">
    <PageHeader eyebrow="Relationship intelligence" title="Relationships" subtitle="Know who matters, who is going cold, and what conversation should happen next." actions={<><Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button><Button icon="plus" onClick={openNewClient}>Add relationship</Button></>}/>
    {error&&<StateBanner tone="danger" title="Relationships need attention">{error}</StateBanner>}

    <div className="px-status-ribbon">
      <div className="px-status-ribbon-item"><strong>{stats.active||0}</strong><span>active</span></div>
      <div className="px-status-ribbon-item" data-alert={Number(stats.dueFollowups||0)>0}><strong>{stats.dueFollowups||0}</strong><span>follow-ups due</span></div>
      <div className="px-status-ribbon-item" data-alert={Number(stats.noContact30d||0)>0}><strong>{stats.noContact30d||0}</strong><span>cold / 30d+</span></div>
      <div className="px-status-ribbon-item"><strong>{touched7d}</strong><span>interactions / 7d</span></div>
      <div className="px-status-ribbon-item"><strong>{attention.length}</strong><span>need a move</span></div>
    </div>

    {attention.length>0&&<div className="px-relationship-brief"><div><div className="px-brief-label">Relationship watch</div><strong>{attention.length} relationship{attention.length===1?'':'s'} need a deliberate move.</strong><span>{attention.slice(0,3).map(c=>c.name).join(' · ')}{attention.length>3?` · +${attention.length-3} more`:''}</span></div><Button variant="tonal" icon="spark" onClick={()=>openAI(`Relationships needing attention: ${attention.map(c=>`${c.name} (${contactState(c).label})`).join(', ')}. Rank who I should contact first and why, then give me the next move for each.`)}>Prioritise outreach</Button></div>}

    <div className="px-relationship-toolbar">
      <div className="px-search-input"><Icon name="search" size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search people, organisations or roles…"/></div>
      <div className="px-filter-row">{TYPES.map(x=><button key={x} className={`filter-btn ${filter===x?'filter-btn--active':''}`} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    </div>

    <div className="px-relationship-layout">
      <section className="px-relationship-list" aria-label="Relationships">
        {loading?<LoadingRows count={6}/>:filtered.length===0?<EmptyState icon="users" title="No relationships match" body="Clear the search or add a new client, partner, prospect or funder." action={<Button variant="tonal" onClick={openNewClient}>Add relationship</Button>}/>:filtered.map(c=>{const s=contactState(c);return <button key={c.id} className={`px-relationship-card ${selected===c.id?'px-relationship-card--active':''}`} onClick={()=>setSelected(c.id)}><div className="px-relationship-avatar">{c.avatar_emoji||String(c.name||'?').slice(0,1)}</div><div className="px-relationship-main"><div className="px-between"><div className="px-relationship-name">{c.name}</div><Pill tone={typeTone(c.type)}>{c.type}</Pill></div><div className="px-relationship-org">{c.org||'Independent'}{c.role?` · ${c.role}`:''}</div><div className="px-relationship-meta"><Pill tone={s.tone}>{s.label}</Pill>{c.next_followup&&new Date(c.next_followup)>new Date()&&<span>Next {relativeDate(c.next_followup)}</span>}</div></div><Icon name="chevron" size={17}/></button>})}
      </section>

      <section className="px-relationship-detail">
        {!selected?<EmptyState icon="users" title="Choose a relationship" body="Select someone to see the relationship state, history and next move."/>:detailLoading&&!detail?<LoadingRows count={6}/>:detail?<>
          <div className="px-relationship-hero">
            <div className="px-relationship-avatar px-relationship-avatar--large">{detail.avatar_emoji||String(detail.name||'?').slice(0,1)}</div>
            <div className="px-relationship-hero-main"><div className="px-row" style={{flexWrap:'wrap'}}><h2>{detail.name}</h2><Pill tone={typeTone(detail.type)}>{detail.type}</Pill><Pill tone={state.tone}>{state.label}</Pill></div><p>{detail.org||'Independent'}{detail.role?` · ${detail.role}`:''}{detail.location?` · ${detail.location}`:''}</p></div>
            <Button variant="secondary" icon="spark" onClick={askAboutClient}>Review</Button>
          </div>
          <div className="px-relationship-actions">
            <Button variant="tonal" icon="plus" onClick={()=>{setInteractionForm(EMPTY_INTERACTION);setDrawer('interaction');}}>Log interaction</Button>
            <Button variant="secondary" icon="spark" onClick={askAboutClient}>Draft follow-up</Button>
            {detail.email&&<a className="px-contact-link" href={`mailto:${detail.email}`}>Email</a>}
            {detail.phone&&<a className="px-contact-link" href={`tel:${detail.phone}`}>Call</a>}
          </div>
          <div className="px-relationship-summary">
            <div><span>Last contact</span><strong>{detail.last_contact?formatDate(detail.last_contact,{year:true}):'Never'}</strong></div>
            <div><span>Next follow-up</span><strong>{detail.next_followup?relativeDate(detail.next_followup):'Not set'}</strong></div>
            <div><span>Interactions</span><strong>{nonPayments.length}</strong></div>
            <div><span>Payments logged</span><strong>{payments.length}</strong></div>
          </div>
          <div className="px-relationship-sections">
            <Panel title="Conversation history" subtitle="Recent contact, outcomes and the trail behind the relationship.">
              {nonPayments.length?<div className="px-timeline">{nonPayments.slice(0,12).map(i=><div className="px-timeline-row" key={i.id}><div className="px-timeline-icon"><Icon name={interactionIcon(i.type)} size={16}/></div><div className="px-timeline-main"><div className="px-between"><div className="px-list-title">{i.title||i.type}</div><span className="px-kicker">{formatDate(i.date,{year:true})}</span></div><div className="px-list-sub" style={{whiteSpace:'normal'}}>{i.content}</div>{i.outcome&&<div className="px-timeline-outcome">Next: {i.outcome}</div>}</div></div>)}</div>:<EmptyState icon="document" title="No interaction history" body="Log the first call, meeting, note or email so JakeOS can reason about this relationship."/>}
            </Panel>
            <Panel title="Relationship context" subtitle="Useful coordinates before the next conversation.">
              <div className="px-context-grid"><div><span>Email</span><strong>{detail.email||'—'}</strong></div><div><span>Phone</span><strong>{detail.phone||'—'}</strong></div><div><span>Status</span><strong>{detail.status||'Active'}</strong></div><div><span>Open follow-ups</span><strong>{detail.followups?.length||0}</strong></div></div>
              {detail.notes&&<div className="px-relationship-notes">{String(detail.notes).replace(/^__CV__:[\s\S]*?\n---\n/,'')}</div>}
            </Panel>
          </div>
        </>:<EmptyState icon="warning" title="Relationship unavailable" body="JakeOS could not load this relationship."/>}
      </section>
    </div>

    {drawer==='client'&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&setDrawer(null)}><div className="px-drawer-card"><PageHeader eyebrow="New relationship" title="Add relationship" subtitle="Capture enough context for JakeOS to know who this person is and why the relationship matters." actions={<button className="px-icon-button" onClick={()=>setDrawer(null)}>×</button>}/><div className="px-stack"><div className="px-form-grid"><div className="px-field"><label>Name</label><input autoFocus value={clientForm.name} onChange={e=>setClientForm(f=>({...f,name:e.target.value}))}/></div><div className="px-field"><label>Organisation</label><input value={clientForm.org} onChange={e=>setClientForm(f=>({...f,org:e.target.value}))}/></div></div><div className="px-form-grid"><div className="px-field"><label>Role</label><input value={clientForm.role} onChange={e=>setClientForm(f=>({...f,role:e.target.value}))}/></div><div className="px-field"><label>Relationship type</label><select value={clientForm.type} onChange={e=>setClientForm(f=>({...f,type:e.target.value}))}>{['Partner','Client','Prospect','Funder'].map(x=><option key={x}>{x}</option>)}</select></div></div><div className="px-form-grid"><div className="px-field"><label>Email</label><input type="email" value={clientForm.email} onChange={e=>setClientForm(f=>({...f,email:e.target.value}))}/></div><div className="px-field"><label>Phone / WhatsApp</label><input value={clientForm.phone} onChange={e=>setClientForm(f=>({...f,phone:e.target.value}))}/></div></div><div className="px-field"><label>Location</label><input value={clientForm.location} onChange={e=>setClientForm(f=>({...f,location:e.target.value}))}/></div><div className="px-field"><label>Context</label><textarea value={clientForm.notes} onChange={e=>setClientForm(f=>({...f,notes:e.target.value}))} placeholder="Relationship context, current conversation, opportunity or history"/></div></div><div className="px-form-actions"><Button variant="secondary" onClick={()=>setDrawer(null)}>Cancel</Button><Button onClick={saveClient} disabled={saving}>{saving?'Saving…':'Save relationship'}</Button></div></div></div>}

    {drawer==='interaction'&&detail&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&setDrawer(null)}><div className="px-drawer-card"><PageHeader eyebrow="Relationship activity" title={`Log ${detail.name}`} subtitle="Record what happened, the outcome and whether a follow-up is required." actions={<button className="px-icon-button" onClick={()=>setDrawer(null)}>×</button>}/><div className="px-stack"><div className="px-field"><label>Interaction type</label><select value={interactionForm.type} onChange={e=>setInteractionForm(f=>({...f,type:e.target.value}))}>{INTERACTION_TYPES.map(x=><option key={x}>{x}</option>)}</select></div>{interactionForm.type==='payment'?<><div className="px-form-grid"><div className="px-field"><label>Amount</label><input type="number" min="0" value={interactionForm.amount} onChange={e=>setInteractionForm(f=>({...f,amount:e.target.value}))}/></div><div className="px-field"><label>Currency</label><select value={interactionForm.currency} onChange={e=>setInteractionForm(f=>({...f,currency:e.target.value}))}>{['UGX','USD','KES','EUR','GBP'].map(x=><option key={x}>{x}</option>)}</select></div></div><div className="px-form-grid"><div className="px-field"><label>Method</label><select value={interactionForm.method} onChange={e=>setInteractionForm(f=>({...f,method:e.target.value}))}>{['Mobile Money','Bank Transfer','Cash','Wire Transfer','Cheque'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Status</label><select value={interactionForm.payment_status} onChange={e=>setInteractionForm(f=>({...f,payment_status:e.target.value}))}>{['Received','Pending','Partial'].map(x=><option key={x}>{x}</option>)}</select></div></div><div className="px-field"><label>Reference</label><input value={interactionForm.reference} onChange={e=>setInteractionForm(f=>({...f,reference:e.target.value}))}/></div></>:<><div className="px-field"><label>Title</label><input value={interactionForm.title} onChange={e=>setInteractionForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Partnership check-in"/></div><div className="px-field"><label>What happened?</label><textarea value={interactionForm.content} onChange={e=>setInteractionForm(f=>({...f,content:e.target.value}))}/></div><div className="px-field"><label>Outcome / next step</label><input value={interactionForm.outcome} onChange={e=>setInteractionForm(f=>({...f,outcome:e.target.value}))}/></div><div className="px-form-grid"><div className="px-field"><label>Date</label><input type="date" value={interactionForm.date} onChange={e=>setInteractionForm(f=>({...f,date:e.target.value}))}/></div><div className="px-field"><label>Follow-up date</label><input type="date" value={interactionForm.follow_up_date} onChange={e=>setInteractionForm(f=>({...f,follow_up_date:e.target.value}))}/></div></div>{interactionForm.follow_up_date&&<div className="px-field"><label>Reminder</label><input value={interactionForm.follow_up_note} onChange={e=>setInteractionForm(f=>({...f,follow_up_note:e.target.value}))} placeholder="What should you remember to do?"/></div>}</>}</div><div className="px-form-actions"><Button variant="secondary" onClick={()=>setDrawer(null)}>Cancel</Button><Button onClick={saveInteraction} disabled={saving}>{saving?'Saving…':'Record interaction'}</Button></div></div></div>}
  </div>;
}
