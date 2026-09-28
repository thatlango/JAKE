import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, Icon, LoadingRows, PageHeader, Panel, Pill, StateBanner, formatDate, relativeDate } from '../components/ProductUI';
import { ConfirmDialog } from '../components/InteractionUI';
import { APP_TIMEZONE, dateKey, timeKey, zonedLocalToIso } from '../utils/time';

const EMPTY={title:'',date:new Date().toISOString().slice(0,10),time:'09:00',project:'',type:'session',notes:'',all_day:false};
const typeTone=t=>t==='deadline'?'danger':t==='milestone'?'warning':t==='meeting'?'info':'neutral';

export default function Calendar({openAI,initialEventId=null}){
  const[events,setEvents]=useState([]),[gcal,setGcal]=useState({configured:false,connected:false,email:null}),[gcalEvents,setGcalEvents]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[drawer,setDrawer]=useState(null),[form,setForm]=useState(EMPTY),[saving,setSaving]=useState(false),[view,setView]=useState('upcoming'),[pendingDelete,setPendingDelete]=useState(null);
  const deepOpened=useRef(null);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    const sources=[['local','/api/calendar/events'],['status','/api/gcal/status'],['google','/api/gcal/events']];
    const results=await Promise.allSettled(sources.map(async([name,url])=>{
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||`${name} returned ${response.status}`);
      return{name,body};
    }));
    const failed=[];
    results.forEach((result,index)=>{
      const name=sources[index][0];
      if(result.status==='rejected'){failed.push(name);return;}
      const body=result.value.body||{};
      if(name==='local')setEvents(body.events||[]);
      if(name==='status')setGcal(body||{});
      if(name==='google')setGcalEvents(body.events||[]);
    });
    if(failed.includes('local'))setError('JakeOS calendar could not refresh. Previously loaded commitments remain visible where available.');
    else if(failed.length)setError(`External calendar source temporarily unavailable: ${failed.filter(x=>x!=='local').join(', ')}. JakeOS commitments remain usable.`);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);
  const combined=useMemo(()=>[...events.map(x=>({...x,source:x.source||'jakeos'})),...gcalEvents.map(x=>({...x,source:'google'}))].filter((x,i,a)=>a.findIndex(y=>y.id===x.id&&y.source===x.source)===i),[events,gcalEvents]);
  const now=new Date(),todayKey=dateKey(now,APP_TIMEZONE),startOfToday=zonedLocalToIso(todayKey,'00:00',APP_TIMEZONE),upcoming=combined.filter(x=>!x.done&&new Date(x.starts_at||x.date)>=new Date(startOfToday)).sort((a,b)=>new Date(a.starts_at||a.date)-new Date(b.starts_at||b.date)),today=upcoming.filter(x=>dateKey(x.starts_at||x.date,APP_TIMEZONE)===todayKey),week=upcoming.filter(x=>new Date(x.starts_at||x.date).getTime()<=Date.now()+7*86400000);
  const openNew=()=>{setForm(EMPTY);setDrawer('new');};
  const edit=e=>{if(e.source==='google')return;const d=e.starts_at?new Date(e.starts_at):null;setForm({...EMPTY,...e,date:dateKey(e.starts_at||e.date,APP_TIMEZONE),time:d&&!Number.isNaN(d)?timeKey(d,APP_TIMEZONE):'09:00'});setDrawer(e.id);window.history.pushState({},'',`/calendar/${encodeURIComponent(e.id)}`);};
  const closeDrawer=()=>{setDrawer(null);if(window.location.pathname.startsWith('/calendar/'))window.history.replaceState({},'','/?module=calendar');};
  useEffect(()=>{if(!initialEventId||deepOpened.current===initialEventId||!events.length)return;const event=events.find(x=>String(x.id)===String(initialEventId));if(event){deepOpened.current=initialEventId;edit(event);}},[initialEventId,events]);
  const save=async()=>{if(!form.title.trim()||!form.date)return;setSaving(true);const starts=form.all_day?null:zonedLocalToIso(form.date,form.time||'09:00',APP_TIMEZONE);const body={...form,title:form.title.trim(),starts_at:starts,all_day:!!form.all_day};const r=await fetch(drawer==='new'?'/api/calendar/events':`/api/calendar/events/${encodeURIComponent(drawer)}`,{method:drawer==='new'?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error||'Could not save event.');else{closeDrawer();setForm(EMPTY);await load();}setSaving(false);};
  const toggle=async e=>{if(e.source==='google')return;const r=await fetch(`/api/calendar/events/${encodeURIComponent(e.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({done:!e.done})});if(!r.ok){const d=await r.json().catch(()=>({}));setError(d.error||'Event status could not be changed.');return;}await load();};
  const remove=async e=>setPendingDelete(e);
  const confirmRemove=async()=>{if(!pendingDelete)return;setSaving(true);const r=await fetch(`/api/calendar/events/${encodeURIComponent(pendingDelete.id)}`,{method:'DELETE'});const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error||'Event could not be deleted.');setSaving(false);return;}setPendingDelete(null);closeDrawer();await load();setSaving(false);};
  const sync=async()=>{const r=await fetch('/api/gcal/sync',{method:'POST'});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error||'Google Calendar sync failed.');else await load();};
  const visible=view==='today'?today:view==='week'?week:view==='all'?combined:upcoming;
  return <div className="module">
    <PageHeader eyebrow="Time" title="Calendar" subtitle="Commitments and work blocks that constrain what JakeOS should ask of you today." actions={<><Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button><Button icon="plus" onClick={openNew}>Add event</Button></>}/>
    {error&&<StateBanner tone="danger" title="Calendar needs attention">{error}</StateBanner>}
    {!gcal.configured&&<StateBanner tone="info" title="Google Calendar is not connected yet">JakeOS calendar works now with its own events. Server-side Google sync will become available when the OAuth client credentials are configured.</StateBanner>}
    {gcal.configured&&!gcal.connected&&<StateBanner tone="info" title="Google Calendar is ready to connect" action={<Button variant="tonal" onClick={()=>window.location.assign('/auth/google')}>Connect Google</Button>}>Connect once to bring external commitments into JakeOS planning.</StateBanner>}
    {gcal.connected&&<StateBanner tone="success" title={`Google Calendar connected${gcal.email?` · ${gcal.email}`:''}`} action={<Button variant="secondary" onClick={sync}>Sync now</Button>}>JakeOS uses these events when planning the day.</StateBanner>}
    <div className="px-metrics"><div className="px-metric"><div className="px-metric-value">{today.length}</div><div className="px-metric-label">Today</div><div className="px-metric-helper">Commitments on the day</div></div><div className="px-metric"><div className="px-metric-value">{upcoming.length}</div><div className="px-metric-label">Upcoming</div><div className="px-metric-helper">Open future events</div></div><div className="px-metric"><div className="px-metric-value">{events.filter(x=>x.source!=='google').length}</div><div className="px-metric-label">JakeOS events</div><div className="px-metric-helper">Canonical local calendar</div></div><div className="px-metric"><div className="px-metric-value">{gcalEvents.length}</div><div className="px-metric-label">Google events</div><div className="px-metric-helper">{gcal.connected?'Synced':'Not connected'}</div></div></div>
    <Panel title="Schedule" subtitle="Use the view that matches the decision you are making." action={<div className="px-row">{['today','week','upcoming','all'].map(v=><Button key={v} variant={view===v?'tonal':'ghost'} onClick={()=>setView(v)}>{v[0].toUpperCase()+v.slice(1)}</Button>)}</div>}>
      {loading?<LoadingRows count={6}/>:visible.length===0?<EmptyState icon="calendar" title={view==='today'?'Nothing scheduled today':'No events in this view'} body="Add an event when a commitment truly constrains your time. Tasks belong in Work, not the calendar." action={<Button variant="tonal" onClick={openNew}>Add event</Button>}/>:<div className="px-list">{visible.map(event=>{const row=<><div className="px-metric-icon" style={{margin:0,width:38,height:38,background:event.source==='google'?'var(--px-success-soft)':'var(--px-brand-soft)',color:event.source==='google'?'var(--px-success)':'var(--px-brand)'}}><Icon name="calendar" size={18}/></div><div className="px-list-main"><div className="px-list-title">{event.title}</div><div className="px-list-sub">{event.project||event.source}{event.notes?` · ${event.notes}`:''}</div><div className="px-task-meta"><Pill tone={typeTone(event.type)}>{event.type||'event'}</Pill>{event.source==='google'&&<Pill tone="success">Google · read only</Pill>}</div></div><div className="px-list-meta">{event.starts_at?formatDate(event.starts_at,{time:true}):formatDate(event.date)}<div style={{marginTop:4}}>{relativeDate(event.starts_at||event.date)}</div></div></>;return event.source==='google'?<div className="px-list-row" key={`${event.source}-${event.id}`}>{row}</div>:<button className="px-list-row" key={`${event.source}-${event.id}`} onClick={()=>edit(event)} style={{width:'100%',textAlign:'left',cursor:'pointer'}}>{row}</button>;})}</div>}
    </Panel>
    {drawer&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&closeDrawer()}><div className="px-drawer-card"><PageHeader eyebrow="Commitment" title={drawer==='new'?'Add event':'Edit event'} subtitle="Reserve calendar space for real commitments. Use Work for flexible tasks." actions={<button className="px-icon-button" onClick={closeDrawer}>×</button>}/><div className="px-stack"><div className="px-field"><label>Title</label><input autoFocus value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div><div className="px-form-grid"><div className="px-field"><label>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div><div className="px-field"><label>Time</label><input type="time" disabled={form.all_day} value={form.time||''} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></div></div><div className="px-form-grid"><div className="px-field"><label>Project / label</label><input value={form.project||''} onChange={e=>setForm(f=>({...f,project:e.target.value}))}/></div><div className="px-field"><label>Type</label><select value={form.type||'session'} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{['session','meeting','deadline','milestone','travel','personal'].map(x=><option key={x}>{x}</option>)}</select></div></div><label className="px-row" style={{fontSize:12,color:'var(--px-muted)'}}><input type="checkbox" checked={!!form.all_day} onChange={e=>setForm(f=>({...f,all_day:e.target.checked}))}/> All-day commitment</label><div className="px-field"><label>Notes</label><textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div></div><div className="px-form-actions">{drawer!=='new'&&<Button variant="danger" onClick={()=>remove(form)}>Delete</Button>}<span style={{flex:1}}/>{drawer!=='new'&&<Button variant="secondary" onClick={()=>toggle(form)}>{form.done?'Mark open':'Mark done'}</Button>}<Button onClick={save} disabled={saving}>{saving?'Saving…':'Save event'}</Button></div></div></div>}
    <ConfirmDialog open={!!pendingDelete} onClose={()=>!saving&&setPendingDelete(null)} onConfirm={confirmRemove} busy={saving} title="Delete calendar event?" body={pendingDelete?`${pendingDelete.title} will be removed from the JakeOS calendar. External Google events are never deleted here.`:''} confirmLabel="Delete event"/>
  </div>;
}
