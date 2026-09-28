import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, Pill, StateBanner, formatMoney, relativeDate } from '../components/ProductUI';
import Finance from './Finance';

const STAGES=['Target','Contacted','Conversation','Proposal','Negotiation','Contracted','Invoiced','Paid','Lost','Parked'];
const tone=s=>s==='Paid'||s==='Contracted'?'success':s==='Invoiced'||s==='Negotiation'?'info':s==='Proposal'||s==='Conversation'?'warning':s==='Lost'?'danger':'neutral';
const phase=d=>d<=3?'Activate':d<=7?'Outreach':d<=14?'Qualify':d<=21?'Close':'Deliver + collect';

const initialMissionView=initialAccountId=>{
  if(initialAccountId)return 'accounts';
  const params=new URLSearchParams(window.location.search);
  if(params.get('module')==='finance')return 'plan';
  const requested=params.get('view');
  return ['command','engine','accounts','plan'].includes(requested)?requested:'command';
};

export default function RevenueSprint({openAI,navigate,initialAccountId=null}){
  const[data,setData]=useState(null),[error,setError]=useState(''),[view,setView]=useState(()=>initialMissionView(initialAccountId)),[selectedAccountId,setSelectedAccountId]=useState(initialAccountId);
  const[actionDraft,setActionDraft]=useState({account_id:'',title:'',action_date:'',priority:'high'});
  const load=useCallback(async()=>{try{const r=await fetch('/api/revenue-sprint');const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Revenue Mission could not be loaded.');setData(d);setError('');}catch(e){setError(e.message);}},[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    const legacy=new URLSearchParams(window.location.search).get('module')==='finance';
    if(legacy)window.history.replaceState({},'','/revenue-mission?view=plan');
    const onPop=()=>setView(initialMissionView(null));
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[]);
  const patchAccount=async(id,updates)=>{const r=await fetch('/api/revenue-sprint/accounts/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});if(!r.ok){const d=await r.json().catch(()=>({}));setError(d.error||'Could not update account.');return;}await load();};
  const finishAction=async id=>{const r=await fetch('/api/revenue-sprint/actions/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'done'})});if(!r.ok){setError('Could not complete action.');return;}await load();};
  const createAction=async()=>{
    const accountId=actionDraft.account_id,title=actionDraft.title.trim();
    if(!accountId||!title){setError('Choose an account and enter an action.');return;}
    const r=await fetch('/api/revenue-sprint/accounts/'+encodeURIComponent(accountId)+'/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,action_date:actionDraft.action_date||data?.today,priority:actionDraft.priority,action_type:'follow-up'})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){setError(d.error||'Could not create revenue action.');return;}
    setActionDraft({account_id:accountId,title:'',action_date:'',priority:'high'});
    setError('');
    await load();
  };
  if(!data)return <div className='module'><PageHeader eyebrow='Commercial execution' title='$10K Revenue Mission' subtitle='Loading Revenue Mission…'/>{error&&<StateBanner tone='danger' title='Revenue Mission needs attention'>{error}</StateBanner>}</div>;
  const s=data.sprint||{},m=data.summary||{},accounts=data.accounts||[],due=data.due_actions||[],close=data.close_next||[],engine=data.engine||{},offers=engine.offers||[],markets=engine.markets||[],channels=engine.channels||[],campaigns=engine.campaigns||[],experiments=engine.experiments||[],proof=engine.proof||[];
  const selectedAccount=accounts.find(a=>String(a.id)===String(selectedAccountId))||null;
  const accountActions=(data.actions||[]).filter(a=>String(a.account_id||'')===String(selectedAccountId||''));
  const openAccount=id=>{setSelectedAccountId(id);setView('accounts');window.history.pushState({},'',`/revenue/accounts/${encodeURIComponent(id)}`);window.scrollTo({top:0,behavior:'smooth'});};
  const closeAccount=()=>{setSelectedAccountId(null);if(window.location.pathname.startsWith('/revenue/accounts/'))window.history.replaceState({},'','/revenue-mission');};
  const setMissionView=id=>{
    setView(id);
    if(id!=='accounts')setSelectedAccountId(null);
    const url=id==='command'?'/revenue-mission':('/revenue-mission?view='+encodeURIComponent(id));
    window.history.pushState({},'',url);
    window.scrollTo({top:0,behavior:'smooth'});
  };

  const ask=()=>openAI('Revenue Mission: cash target '+s.cash_target_usd+' USD; cash collected '+m.cash_collected_usd+'; contracted '+m.contracted_usd+'; proposal value '+m.proposal_value_usd+'; gross pipeline '+m.gross_pipeline_usd+'; durable quarterly target '+(data.plan?.targets?.quarterly||0)+'; annual target '+(data.plan?.targets?.annual||0)+'; day '+m.day_number+' of '+m.total_days+'; at-risk accounts '+m.at_risk_count+'. Reconcile the durable revenue plan with the active mission. Tell me the shortest credible route to cash today, what to stop, and the three accounts I should personally push.');
  const metrics=<div className='px-metrics'>
    <div className='px-metric px-metric--success'><div className='px-metric-value'>{formatMoney(m.cash_collected_usd||0,'USD')}</div><div className='px-metric-label'>Cash collected</div><div className='px-metric-helper'>{m.target_progress_pct||0}% of {formatMoney(s.cash_target_usd||10000,'USD')}</div></div>
    <div className='px-metric px-metric--warning'><div className='px-metric-value'>{formatMoney(m.contracted_usd||0,'USD')}</div><div className='px-metric-label'>Contracted</div><div className='px-metric-helper'>Target {formatMoney(s.contracted_target_usd||20000,'USD')}</div></div>
    <div className='px-metric'><div className='px-metric-value'>{formatMoney(m.proposal_value_usd||0,'USD')}</div><div className='px-metric-label'>Proposals</div><div className='px-metric-helper'>Target {formatMoney(s.proposal_target_usd||50000,'USD')}</div></div>
    <div className='px-metric'><div className='px-metric-value'>{formatMoney(m.gross_pipeline_usd||0,'USD')}</div><div className='px-metric-label'>Gross pipeline</div><div className='px-metric-helper'>Cash-now {formatMoney(m.cash_now_pipeline_usd||0,'USD')} · tender {formatMoney(m.tender_upside_pipeline_usd||0,'USD')}</div></div>
    <div className='px-metric'><div className='px-metric-value'>Day {m.day_number||1}/{m.total_days||30}</div><div className='px-metric-label'>{phase(Number(m.day_number||1))}</div><div className='px-metric-helper'>{m.days_remaining||0} days left</div></div>
  </div>;
  const command=<>{metrics}<Panel title='Cash target' subtitle={'Gap '+formatMoney(m.cash_gap_usd||0,'USD')+' · '+(m.active_accounts||0)+' active accounts · '+(m.at_risk_count||0)+' at risk'}><div className='progress-bar progress-bar--lg'><div className='progress-fill' style={{width:(m.target_progress_pct||0)+'%',background:'var(--px-brand)'}}/></div></Panel>
    <div className='px-grid-2'><Panel title='Today / overdue' subtitle='This queue outranks non-commercial work while the mission is active.'>{due.length?<div className='px-list'>{due.map(a=><div className='px-list-row' key={a.id}><div className='px-list-main'><div className='px-list-title'>{a.title}</div><div className='px-list-sub'>{a.org?a.org+' · ':''}{a.action_date===data.today?'Today':relativeDate(a.action_date)} · {a.channel||a.action_type}</div></div><Pill tone={a.priority==='critical'?'danger':'warning'}>{a.priority}</Pill><Button variant='ghost' onClick={()=>finishAction(a.id)}>Done</Button></div>)}</div>:<EmptyState icon='check' title='Commercial queue clear' body='Move to the close-next list.'/>}</Panel>
    <Panel title='Close next' subtitle='Ranked by expected 30-day cash, not prestige.'><div className='px-list'>{close.slice(0,8).map(a=><div className='px-list-row' key={a.id}><div className='px-list-main'><div className='px-list-title'>{a.org}</div><div className='px-list-sub'>{a.offer}</div><div className='px-task-meta'><Pill tone={tone(a.stage)}>{a.stage}</Pill><span>{a.probability}%</span></div></div><strong>{formatMoney(a.cash_30d_target_usd||0,'USD')}</strong></div>)}</div></Panel></div>
    <Panel title='Mission guardrails' subtitle='The rules that keep the target real.'><div className='px-list'><div className='px-list-row'><strong>Cash beats pipeline</strong><span>Do not count tenders toward the $10K until award/payment path exists.</span></div><div className='px-list-row'><strong>Mobilize early</strong><span>Ask 50–70% upfront on short fixed-price work where rules permit.</span></div><div className='px-list-row'><strong>24-hour proposals</strong><span>Qualified buyer conversation → proposal within one business day.</span></div><div className='px-list-row'><strong>Conflict guardrail</strong><span>GOPA/GIZ work only through formal procurement with no award influence.</span></div></div></Panel></>;
  const accountsView=<>
    {selectedAccountId&&!selectedAccount&&<StateBanner tone='warning' title='Revenue account not found'>The account in this URL is no longer available in the current Revenue Mission. Return to the account list and choose another record.</StateBanner>}
    {selectedAccount&&<Panel
      title={selectedAccount.org}
      subtitle={selectedAccount.offer||'Revenue account'}
      action={<Button variant='ghost' onClick={closeAccount}>Close detail</Button>}
    >
      <div className='px-context-grid'>
        <div><span>Lane</span><strong>{selectedAccount.lane||'—'}</strong></div>
        <div><span>Stage</span><strong>{selectedAccount.stage||'—'}</strong></div>
        <div><span>Probability</span><strong>{Number(selectedAccount.probability||0)}%</strong></div>
        <div><span>Pipeline</span><strong>{formatMoney(selectedAccount.pipeline_value_usd||0,'USD')}</strong></div>
        <div><span>Contracted</span><strong>{formatMoney(selectedAccount.contracted_usd||0,'USD')}</strong></div>
        <div><span>Cash collected</span><strong>{formatMoney(selectedAccount.cash_collected_usd||0,'USD')}</strong></div>
        <div><span>30-day cash target</span><strong>{formatMoney(selectedAccount.cash_30d_target_usd||0,'USD')}</strong></div>
        <div><span>Owner</span><strong>{selectedAccount.owner||'Jacob'}</strong></div>
      </div>
      <div className='px-grid-2' style={{marginTop:14}}>
        <div className='px-panel' style={{boxShadow:'none'}}>
          <div className='px-brief-label'>Contact</div>
          <div className='px-list-title'>{selectedAccount.contact_name||'No contact recorded'}</div>
          <div className='px-list-sub'>{[selectedAccount.contact_email,selectedAccount.contact_channel].filter(Boolean).join(' · ')||'Add a commercial contact so the next move has an owner and channel.'}</div>
        </div>
        <div className='px-panel' style={{boxShadow:'none'}}>
          <div className='px-brief-label'>Next action</div>
          <div className='px-list-title'>{selectedAccount.next_action||'No next action recorded'}</div>
          <div className='px-list-sub'>{selectedAccount.next_action_date?'Due '+selectedAccount.next_action_date:'No action date recorded'}</div>
        </div>
      </div>
      {selectedAccount.risk&&<div style={{marginTop:14}}><StateBanner tone='warning' title='Risk'>{selectedAccount.risk}</StateBanner></div>}
      {selectedAccount.notes&&<div style={{marginTop:14}}><div className='px-brief-label'>Notes</div><div className='px-relationship-notes'>{selectedAccount.notes}</div></div>}
      <div style={{marginTop:14}}>
        <div className='px-between'><div><div className='px-brief-label'>Commercial actions</div><div className='px-list-sub'>Canonical Revenue Mission actions linked to this account.</div></div><Button variant='tonal' onClick={()=>setActionDraft(v=>({...v,account_id:selectedAccount.id}))}>Prepare action</Button></div>
        {accountActions.length?<div className='px-list' style={{marginTop:10}}>{accountActions.map(a=><div className='px-list-row' key={a.id}><div className='px-list-main'><div className='px-list-title'>{a.title}</div><div className='px-list-sub'>{a.action_date||'No date'} · {a.channel||a.action_type||'follow-up'}</div></div><Pill tone={a.status==='done'?'success':a.priority==='critical'?'danger':'neutral'}>{a.status==='done'?'Done':a.priority||'open'}</Pill>{a.status!=='done'&&<Button variant='ghost' onClick={()=>finishAction(a.id)}>Done</Button>}</div>)}</div>:<EmptyState icon='check' title='No account actions yet' body='Create the next commercial action below; it will also become canonical JakeOS Work.'/>}
      </div>
      <div className='px-form-actions' style={{justifyContent:'flex-start'}}>
        {selectedAccount.opportunity_id&&<Button variant='secondary' onClick={()=>navigate?.('opportunities',{id:selectedAccount.opportunity_id})}>Open linked opportunity</Button>}
        {selectedAccount.source_url&&<Button variant='ghost' onClick={()=>window.open(selectedAccount.source_url,'_blank','noopener,noreferrer')}>Open source</Button>}
      </div>
    </Panel>}
    <Panel title='Create commercial action' subtitle='Every action created here becomes canonical JakeOS Work and can surface in Momentum.'>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,alignItems:'end'}}>
        <label className='px-field'><span>Account</span><select value={actionDraft.account_id} onChange={e=>setActionDraft(v=>({...v,account_id:e.target.value}))}><option value=''>Select account…</option>{accounts.filter(a=>!['Paid','Lost','Parked'].includes(a.stage)).map(a=><option key={a.id} value={a.id}>{a.org} — {a.offer}</option>)}</select></label>
        <label className='px-field'><span>Action</span><input value={actionDraft.title} onChange={e=>setActionDraft(v=>({...v,title:e.target.value}))} placeholder='e.g. Call procurement lead and ask for decision date'/></label>
        <label className='px-field'><span>Date</span><input type='date' value={actionDraft.action_date} onChange={e=>setActionDraft(v=>({...v,action_date:e.target.value}))}/></label>
        <label className='px-field'><span>Priority</span><select value={actionDraft.priority} onChange={e=>setActionDraft(v=>({...v,priority:e.target.value}))}><option value='critical'>Critical</option><option value='high'>High</option><option value='medium'>Medium</option><option value='low'>Low</option></select></label>
        <div className='px-field' style={{alignSelf:'end'}}><Button onClick={createAction}>Add to Revenue Mission</Button></div>
      </div>
    </Panel>
    <Panel title='Revenue accounts' subtitle='Update stage, probability, contracted value, cash and next action directly here.'>
      <div style={{overflowX:'auto'}}><table className='finance-table'><thead><tr><th>Account</th><th>Lane</th><th>Stage</th><th>Pipeline</th><th>Probability</th><th>Contracted</th><th>Cash</th><th>Next action</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id} className={String(selectedAccountId)===String(a.id)?'px-table-row--selected':''}>
        <td><strong>{a.org}</strong><div className='px-list-sub'>{a.offer}</div><Button variant='ghost' onClick={()=>openAccount(a.id)}>Open</Button></td>
        <td>{a.lane}</td>
        <td><select aria-label={'Stage for '+a.org} value={a.stage} onChange={e=>patchAccount(a.id,{stage:e.target.value})}>{STAGES.map(x=><option key={x}>{x}</option>)}</select></td>
        <td>{formatMoney(a.pipeline_value_usd||0,'USD')}</td>
        <td><input aria-label={'Probability for '+a.org} style={{width:72}} type='number' min='0' max='100' defaultValue={a.probability||0} onBlur={e=>patchAccount(a.id,{probability:Number(e.target.value)||0})}/>%</td>
        <td><input aria-label={'Contracted amount for '+a.org} style={{width:95}} type='number' defaultValue={a.contracted_usd||0} onBlur={e=>patchAccount(a.id,{contracted_usd:Number(e.target.value)||0})}/></td>
        <td><input aria-label={'Cash collected for '+a.org} style={{width:95}} type='number' defaultValue={a.cash_collected_usd||0} onBlur={e=>patchAccount(a.id,{cash_collected_usd:Number(e.target.value)||0})}/></td>
        <td style={{minWidth:260}}><input aria-label={'Next action for '+a.org} style={{width:'100%',marginBottom:6}} defaultValue={a.next_action||''} onBlur={e=>{if(e.target.value!==a.next_action)patchAccount(a.id,{next_action:e.target.value});}}/><input aria-label={'Next action date for '+a.org} type='date' defaultValue={a.next_action_date||''} onBlur={e=>{if(e.target.value!==(a.next_action_date||''))patchAccount(a.id,{next_action_date:e.target.value||null});}}/></td>
      </tr>)}</tbody></table></div>
    </Panel>
  </>;
  const plan=<div className='px-stack'>
    <Finance embedded openAI={openAI} baseUrl='/api/revenue-sprint/plan'/>
    <div className='px-grid-2'>
      <Panel title='Mission operating calendar' subtitle='The active mission turns the durable plan into dated commercial action.'><div className='px-list'>{(data.actions||[]).map(a=><div className='px-list-row' key={a.id}><div className='px-list-main'><div className='px-list-title'>{a.title}</div><div className='px-list-sub'>{a.action_date} · {a.action_type}</div></div><Pill tone={a.status==='done'?'success':a.priority==='critical'?'danger':'neutral'}>{a.status==='done'?'Done':a.priority}</Pill>{a.status!=='done'&&<Button variant='ghost' onClick={()=>finishAction(a.id)}>Done</Button>}</div>)}</div></Panel>
      <Panel title='Mission funnel' subtitle='Accounts must move, convert or be parked.'><div className='px-list'>{STAGES.filter(x=>(m.stage_counts||{})[x]).map(x=><div className='px-list-row' key={x}><strong>{x}</strong><Pill tone={tone(x)}>{m.stage_counts[x]}</Pill></div>)}</div></Panel>
    </div>
  </div>;
  const engineView=<>
    <div className='px-metrics'>
      <div className='px-metric px-metric--success'><div className='px-metric-value'>{formatMoney(engine.summary?.target_cash_mix_usd||0,'USD')}</div><div className='px-metric-label'>Campaign cash mix</div><div className='px-metric-helper'>Diversified target across active/planned engines</div></div>
      <div className='px-metric'><div className='px-metric-value'>{offers.length}</div><div className='px-metric-label'>Sellable offers</div><div className='px-metric-helper'>{engine.summary?.fast_offers||0} can target cash inside 14 days</div></div>
      <div className='px-metric'><div className='px-metric-value'>{markets.length}</div><div className='px-metric-label'>Buyer markets</div><div className='px-metric-helper'>Prioritised by velocity and fit</div></div>
      <div className='px-metric'><div className='px-metric-value'>{engine.summary?.active_campaigns||0}</div><div className='px-metric-label'>Active campaigns</div><div className='px-metric-helper'>{engine.summary?.active_experiments||0} live experiments</div></div>
    </div>
    <Panel title='Revenue mix' subtitle='The USD10K target is intentionally spread across different cash engines.'><div className='px-list'>{campaigns.map(c=><div className='px-list-row' key={c.id}><div className='px-list-main'><div className='px-list-title'>{c.name}</div><div className='px-list-sub'>{c.engine} · {c.market_name||'Market'} · {c.channel_name||'Channel'} · {c.target_accounts} accounts</div><div className='px-task-meta'><Pill tone={c.status==='active'?'success':'neutral'}>{c.status}</Pill><span>{c.success_metric}</span></div></div><strong>{formatMoney(c.target_cash_usd||0,'USD')}</strong></div>)}</div></Panel>
    <Panel title='Offers' subtitle='Sell buyer outcomes; the estate products sit underneath the offer.'><div style={{overflowX:'auto'}}><table className='finance-table'><thead><tr><th>Offer</th><th>Buyer outcome</th><th>Price</th><th>Cash speed</th><th>Model</th></tr></thead><tbody>{offers.map(o=><tr key={o.id}><td><strong>{o.name}</strong><div className='px-list-sub'>{o.category} · {o.ideal_buyer}</div></td><td>{o.buyer_outcome}</td><td>{formatMoney(o.price_min_usd||0,'USD')}–{formatMoney(o.price_max_usd||0,'USD')}</td><td>{o.cash_speed_days}d</td><td>{o.delivery_model}</td></tr>)}</tbody></table></div></Panel>
    <div className='px-grid-2'>
      <Panel title='Markets' subtitle='Protect fast cash markets from being crowded out by long-cycle procurement.'><div className='px-list'>{markets.map(x=><div className='px-list-row' key={x.id}><div className='px-list-main'><div className='px-list-title'>{x.name}</div><div className='px-list-sub'>{x.geography} · {x.sales_cycle_min_days}–{x.sales_cycle_max_days}d sales cycle · {formatMoney(x.deal_min_usd||0,'USD')}–{formatMoney(x.deal_max_usd||0,'USD')}</div><div className='px-task-meta'><Pill tone={x.priority==='critical'?'danger':x.priority==='high'?'warning':'neutral'}>{x.priority}</Pill><span>{x.entry_strategy}</span></div></div></div>)}</div></Panel>
      <Panel title='Channels' subtitle='Each channel has a specific job; generic outreach is not a channel.'><div className='px-list'>{channels.map(x=><div className='px-list-row' key={x.id}><div className='px-list-main'><div className='px-list-title'>{x.name}</div><div className='px-list-sub'>{x.best_for}</div><div className='px-task-meta'><Pill>{x.speed}</Pill><span>{x.operating_rule}</span></div></div></div>)}</div></Panel>
    </div>
    <div className='px-grid-2'>
      <Panel title='Commercial experiments' subtitle='Short tests tell us which offers and channels actually convert.'><div className='px-list'>{experiments.map(x=><div className='px-list-row' key={x.id}><div className='px-list-main'><div className='px-list-title'>{x.name}</div><div className='px-list-sub'>{x.starts_on} → {x.ends_on} · {x.channel_name||'Channel'}</div><div className='px-task-meta'><Pill tone={x.status==='active'?'success':'neutral'}>{x.status}</Pill><span>{x.success_threshold}</span></div><div className='px-list-sub'>{x.hypothesis}</div></div></div>)}</div></Panel>
      <Panel title='Proof library' subtitle='Reusable evidence for proposals, outreach and partner conversations.'><div className='px-list'>{proof.map(x=><div className='px-list-row' key={x.id}><div className='px-list-main'><div className='px-list-title'>{x.title}</div><div className='px-list-sub'>{x.proof_type} · {x.relevance_tags}</div><div className='px-list-sub'>{x.summary}</div></div></div>)}</div></Panel>
    </div>
  </>;
  return <div className='module'><PageHeader eyebrow='Commercial execution' title='$10K Revenue Mission' subtitle={(s.starts_on||'2026-09-27')+' → '+(s.ends_on||'2026-10-26')+' · Revenue is the governing objective.'} actions={<><Button variant='secondary' onClick={()=>navigate('opportunities',{view:'pipeline'})}>Opportunities</Button><Button variant='tonal' icon='spark' onClick={ask}>Ask Jake</Button></>}/>{error&&<StateBanner tone='danger' title='Revenue Mission needs attention'>{error}</StateBanner>}<div className='px-tabs' style={{marginBottom:18}}>{[['command','Command'],['plan','Plan & targets'],['engine','Revenue Engine'],['accounts','Accounts']].map(([id,label])=><button key={id} className={view===id?'active':''} onClick={()=>setMissionView(id)}>{label}</button>)}</div>{view==='command'?command:view==='engine'?engineView:view==='accounts'?accountsView:plan}</div>;
}