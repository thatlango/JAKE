import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, Pill, StateBanner, formatMoney, relativeDate } from '../components/ProductUI';
import './ExecutiveDashboard.css';

const ACTIVE_OPPORTUNITY_STAGES=new Set(['Pursuing','Drafting','Submitted','Decision']);
const ACTIVE_AGENT_STATES=new Set(['queued','claimed','working','running','waiting','review','blocked','failed']);
const MARKET_TERMS=['market','revenue','sales','customer','client','bid','proposal','tender','rfp','application','contract','invoice','collect'];
const stageWeight={Decision:50,Submitted:45,Drafting:40,Pursuing:35,Qualifying:25,Watching:10,Discover:5};

const metaOf=item=>item?.metadata&&typeof item.metadata==='object'?item.metadata:{};
const asDate=value=>{const d=value?new Date(value):null;return d&&!Number.isNaN(d.getTime())?d:null;};
const daysOpen=item=>{const d=asDate(item.created_at||item.updated_at);return d?Math.max(0,Math.floor((Date.now()-d.getTime())/86400000)):0;};
const isMarketWork=item=>{
  const meta=metaOf(item);
  if(meta.outcome_type==='market'||meta.outcome_type==='revenue')return true;
  const tags=Array.isArray(item.tags)?item.tags.map(x=>String(x).toLowerCase()):[];
  if(tags.some(tag=>MARKET_TERMS.includes(tag)))return true;
  const haystack=[item.title,item.project_name,item.description].filter(Boolean).join(' ').toLowerCase();
  return MARKET_TERMS.some(term=>haystack.includes(term));
};
const needsDecision=item=>metaOf(item).decision_required===true||metaOf(item).outcome_type==='decision'||item.agent_state==='review';
const signalNeedsDecision=signal=>String(signal?.signal_type||'').toLowerCase()==='decision'||metaOf(signal).decision_required===true;
const hasActiveAgent=item=>item.agent_name&&ACTIVE_AGENT_STATES.has(String(item.agent_state||'').toLowerCase());
const dueScore=value=>{
  const d=asDate(value);if(!d)return 0;
  const hours=(d-Date.now())/3600000;
  if(hours<0)return 30;if(hours<=24)return 25;if(hours<=72)return 18;if(hours<=168)return 10;return 0;
};
const opportunityScore=o=>(stageWeight[o.stage]||0)+(Number(o.fit_score||0)*8)+(Number(o.relevance_score||0)/10)+dueScore(o.deadline)+Math.min(10,Number(o.value_amount||0)/10000);
const formatClock=(value,timeZone='Africa/Kampala')=>{
  const d=asDate(value);if(!d)return null;
  try{return new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone}).format(d);}catch{return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
};
const safeActionHref=value=>{
  const raw=String(value||'').trim();if(!raw)return null;
  if(raw.startsWith('/')&&!raw.startsWith('//'))return raw;
  try{const url=new URL(raw);return ['http:','https:'].includes(url.protocol)?url.toString():null;}catch{return null;}
};

function ExecMetric({label,value,helper,icon,tone='neutral',onClick}){
  return <button className={`exec-metric exec-metric--${tone}`} onClick={onClick}>
    <span className="exec-metric-icon"><Icon name={icon} size={18}/></span>
    <span className="exec-metric-copy"><strong>{value}</strong><span>{label}</span><small>{helper}</small></span>
    <Icon name="arrow" size={15}/>
  </button>;
}

function WorkLine({item,onOpen,actionLabel='Open'}){
  const meta=metaOf(item);
  return <div className="exec-line">
    <div className="exec-line-main">
      <div className="exec-line-title">{item.title}</div>
      <div className="exec-line-meta">
        {item.project_name&&<span>{item.project_name}</span>}
        {item.due_at&&<span>{relativeDate(item.due_at)}</span>}
        {meta.market_stage&&meta.market_stage!=='none'&&<span>{meta.market_stage}</span>}
        {item.agent_name&&<span>{item.agent_name} · {item.agent_state}</span>}
      </div>
      {item.why_now&&<div className="exec-next"><strong>Why now:</strong> {item.why_now}</div>}
      {meta.completion_definition&&<div className="exec-done-definition"><strong>Done:</strong> {meta.completion_definition}</div>}
    </div>
    <button className="exec-line-action" onClick={onOpen}>{actionLabel}<Icon name="arrow" size={14}/></button>
  </div>;
}

function OpportunityLine({item,onOpen}){
  return <div className="exec-line">
    <div className="exec-line-main">
      <div className="exec-line-title">{item.title}</div>
      <div className="exec-line-meta">
        <span>{item.org}</span><span>{item.stage}</span>
        {Number(item.fit_score)>0&&<span>{item.fit_score}/5 fit</span>}
        {item.deadline&&<span>{relativeDate(item.deadline)}</span>}
        {Number(item.value_amount)>0&&<span>{formatMoney(item.value_amount,item.currency||'USD')}</span>}
      </div>
      {item.next_action&&<div className="exec-next"><strong>Next:</strong> {item.next_action}</div>}
    </div>
    <button className="exec-line-action" onClick={onOpen}>Move<Icon name="arrow" size={14}/></button>
  </div>;
}

function DayCard({eyebrow,title,item,timeZone='Africa/Kampala',fallbackBody,onOpen,actionLabel='Open'}){
  if(!item)return <article className="exec-day-card">
    <div className="exec-panel-kicker">{eyebrow}</div>
    <h2>{title}</h2>
    <EmptyState icon="calendar" title={title==='Do now'?'No active block':'Nothing queued next'} body={fallbackBody}/>
  </article>;
  const start=formatClock(item.starts_at||item.scheduled_start,timeZone);
  const end=formatClock(item.ends_at||item.scheduled_end,timeZone);
  const context=item.block_title||item.project_name||item.subtitle||item.project||null;
  return <article className="exec-day-card">
    <div className="exec-panel-kicker">{eyebrow}</div>
    <h2>{title}</h2>
    <div className="exec-day-title">{item.title}</div>
    <div className="exec-day-meta">
      {context&&<span>{context}</span>}
      {(start||end)&&<span>{start||'—'}{end?`–${end}`:''}</span>}
      {Number.isFinite(Number(item.minutes_remaining))&&<span>{Number(item.minutes_remaining)} min left</span>}
      {item.kind&&<span>{item.kind}</span>}
    </div>
    {(item.why_now||item.reason)&&<p>{item.why_now||item.reason}</p>}
    <button className="exec-day-action" onClick={onOpen}>{actionLabel}<Icon name="arrow" size={14}/></button>
  </article>;
}

function Pulse({rows}){
  const max=Math.max(1,...rows.map(row=>row.value));
  return <article className="exec-pulse" aria-label="Operating pulse">
    <div className="exec-panel-kicker">At a glance</div>
    <h2>Operating pulse</h2>
    <p>Where executive attention is concentrated right now.</p>
    <div className="exec-pulse-list">
      {rows.map(row=><div className="exec-pulse-row" key={row.label} aria-label={`${row.label}: ${row.value}`}>
        <div className="exec-pulse-label"><span>{row.label}</span><strong>{row.value}</strong></div>
        <div className="exec-pulse-track"><span style={{width:`${row.value?Math.max(8,(row.value/max)*100):0}%`}}/></div>
      </div>)}
    </div>
  </article>;
}

export default function Dashboard({openAI,navigate}){
  const[data,setData]=useState({overview:null,day:null,today:{priorities:[]},items:[],projects:[],opportunities:[]});
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    const sources=[
      ['overview','/api/overview'],
      ['day','/api/work/day'],
      ['today','/api/work/today?limit=20'],
      ['items','/api/work/items?limit=300'],
      ['projects','/api/work/projects'],
      ['opportunities','/api/opportunities?limit=300']
    ];
    const results=await Promise.allSettled(sources.map(async([name,url])=>{
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||`${name} returned ${response.status}`);
      return{name,body};
    }));
    const next={overview:null,day:null,today:{priorities:[]},items:[],projects:[],opportunities:[]};
    const failed=[];
    results.forEach((result,index)=>{
      const name=sources[index][0];
      if(result.status==='rejected'){failed.push(name);return;}
      const body=result.value.body||{};
      if(name==='overview')next.overview=body;
      if(name==='day')next.day=body;
      if(name==='today')next.today=body;
      if(name==='items')next.items=body.items||[];
      if(name==='projects')next.projects=body.projects||[];
      if(name==='opportunities')next.opportunities=body.opportunities||[];
    });
    setData(next);
    if(failed.length===sources.length)setError('Executive operating picture is unavailable.');
    else if(failed.length)setError(`Some executive sources could not refresh: ${failed.join(', ')}.`);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const overview=data.overview||{};
  const tasks=overview.tasks||{};
  const invoices=overview.invoices||{};
  const signals=overview.attention_signals||[];
  const openItems=data.items.filter(item=>!['done','cancelled'].includes(String(item.status||'').toLowerCase()));
  const reviews=openItems.filter(item=>item.agent_state==='review');

  const criticalSignals=useMemo(()=>signals
    .filter(signal=>['critical','high'].includes(String(signal.severity||'').toLowerCase())&&!signalNeedsDecision(signal))
    .slice(0,5),[signals]);

  const decisionQueue=useMemo(()=>{
    const seen=new Set(),rows=[];
    reviews.forEach(item=>{seen.add(item.id);rows.push({...item,decision_source:'agent review'});});
    openItems.filter(needsDecision).forEach(item=>{if(!seen.has(item.id)){seen.add(item.id);rows.push({...item,decision_source:'work'});}});
    signals.filter(signal=>signalNeedsDecision(signal)).forEach(signal=>{
      const key='signal:'+signal.id;if(!seen.has(key)){seen.add(key);rows.push({...signal,id:key,signal:true,description:signal.summary,decision_source:'decision signal'});}
    });
    return rows.slice(0,6);
  },[openItems,reviews,signals]);

  const marketOpportunities=useMemo(()=>data.opportunities
    .filter(o=>!['Won','Lost','Closed'].includes(o.stage))
    .sort((a,b)=>opportunityScore(b)-opportunityScore(a))
    .slice(0,5),[data.opportunities]);

  const marketWork=useMemo(()=>openItems.filter(item=>isMarketWork(item)&&!hasActiveAgent(item)&&!needsDecision(item))
    .sort((a,b)=>dueScore(b.due_at)-dueScore(a.due_at)||Number(b.priority==='critical')-Number(a.priority==='critical'))
    .slice(0,4),[openItems]);

  const finishQueue=useMemo(()=>{
    const priority={critical:4,high:3,medium:2,low:1};
    return openItems
      .filter(item=>!hasActiveAgent(item)&&!needsDecision(item))
      .sort((a,b)=>{
        const aDoing=a.status==='doing'?1:0,bDoing=b.status==='doing'?1:0;
        if(aDoing!==bDoing)return bDoing-aDoing;
        const aMarket=isMarketWork(a)?1:0,bMarket=isMarketWork(b)?1:0;
        if(aMarket!==bMarket)return bMarket-aMarket;
        const due=dueScore(b.due_at)-dueScore(a.due_at);if(due)return due;
        return (priority[b.priority]||0)-(priority[a.priority]||0);
      }).slice(0,7);
  },[openItems]);

  const delegated=useMemo(()=>openItems.filter(item=>item.agent_name&&ACTIVE_AGENT_STATES.has(String(item.agent_state||'').toLowerCase()))
    .sort((a,b)=>Number(b.agent_state==='review')-Number(a.agent_state==='review'))
    .slice(0,6),[openItems]);

  const parkCandidates=useMemo(()=>openItems.filter(item=>{
    if(item.status==='doing'||item.due_at||isMarketWork(item)||needsDecision(item)||hasActiveAgent(item))return false;
    if(['critical','high'].includes(item.priority))return false;
    return daysOpen(item)>=7;
  }).sort((a,b)=>daysOpen(b)-daysOpen(a)).slice(0,8),[openItems]);

  const personalDoing=openItems.filter(item=>item.status==='doing'&&!hasActiveAgent(item));
  const personalOverdue=openItems.filter(item=>!hasActiveAgent(item)&&item.due_at&&asDate(item.due_at)<new Date()).length;
  const personalBlocked=openItems.filter(item=>!hasActiveAgent(item)&&(item.blocked||item.status==='waiting')&&!needsDecision(item)).length;
  const marketMoves=marketWork.length+data.opportunities.filter(o=>ACTIVE_OPPORTUNITY_STAGES.has(o.stage)).length;
  const cashToCollect=Number(invoices.receivables_value||0);
  const wipLimit=3,wipOver=Math.max(0,personalDoing.length-wipLimit);
  const finishPressure=personalOverdue+personalBlocked+personalDoing.length;

  const rankedFallback=data.today?.priorities?.[0]||finishQueue[0]||marketWork[0]||null;
  const rankedNext=data.today?.priorities?.find(item=>item.id!==rankedFallback?.id)||null;
  const doNow=data.day?.do_now||rankedFallback;
  const upNext=data.day?.up_next||rankedNext;
  const dayTimeZone=data.day?.timezone||'Africa/Kampala';

  const openDayItem=item=>{
    if(!item)return;
    if(item.kind==='event'||item.kind==='block')navigate('calendar');
    else navigate('work');
  };
  const challengeQueue=()=>openAI?.(
    'Act as my executive chief of staff. Challenge this JakeOS operating picture before I start anything new. Prioritise verified completion, revenue/market movement, client delivery and decisions only I can make. Identify what I should finish, delegate, park or decline. Do not reward novelty or old backlog merely because it exists.'
  );

  const pulseRows=[
    {label:'Decide',value:decisionQueue.length},
    {label:'Market',value:marketMoves},
    {label:'Finish',value:finishQueue.length},
    {label:'Delegated',value:delegated.length},
    {label:'Exceptions',value:criticalSignals.length}
  ];

  return <div className="module exec-dashboard">
    {error&&<StateBanner tone={data.overview||data.items.length?'warning':'danger'} title={data.overview||data.items.length?'Executive view is partially degraded':'Executive view needs attention'}>{error}</StateBanner>}
    <header className="exec-head">
      <div>
        <div className="px-eyebrow">Executive operating system</div>
        <h1>Executive</h1>
        <p>Know what to do now. Make the decisions only you can make. Move work to market and closure.</p>
      </div>
      <div className="exec-head-actions">
        <Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>
        <Button icon="spark" onClick={challengeQueue}>Challenge my queue</Button>
      </div>
    </header>

    <section className="exec-loopbar" aria-label="Executive operating loop">
      <span className="is-current">Now</span><Icon name="arrow" size={13}/><span>Decide</span><Icon name="arrow" size={13}/><span>Market</span><Icon name="arrow" size={13}/><span>Finish</span><Icon name="arrow" size={13}/><span>Delegate / review</span><small>Park anything else.</small>
    </section>

    <section className="exec-command-grid">
      <DayCard eyebrow="Momentum" title="Do now" item={doNow} timeZone={dayTimeZone} fallbackBody="There is no active day-plan item or ranked work demanding attention." onOpen={()=>openDayItem(doNow)} actionLabel="Open"/>
      <DayCard eyebrow="Next commitment" title="Up next" item={upNext} timeZone={dayTimeZone} fallbackBody="The schedule has no next commitment yet." onOpen={()=>openDayItem(upNext)} actionLabel="Prepare"/>
      <Pulse rows={pulseRows}/>
    </section>

    <section className="exec-metrics" aria-label="Executive metrics">
      <ExecMetric label="Decisions waiting" value={loading?'—':decisionQueue.length} helper={reviews.length?`${reviews.length} agent review${reviews.length===1?'':'s'} ready`:'Only-your-call queue'} icon="target" tone={decisionQueue.length?'warning':'neutral'} onClick={()=>navigate('work')}/>
      <ExecMetric label="Market moves" value={loading?'—':marketMoves} helper={`${overview.pipeline?.deadlines_14d||0} deadlines in 14d`} icon="chart" tone="brand" onClick={()=>navigate('opportunities',{view:'pipeline'})}/>
      <ExecMetric label="Completion pressure" value={loading?'—':finishPressure} helper={`${personalDoing.length} personal WIP · ${personalOverdue} overdue · ${personalBlocked} blocked`} icon="check" tone={finishPressure?'warning':'neutral'} onClick={()=>navigate('work')}/>
      <ExecMetric label="Completed this week" value={loading?'—':tasks.completed_this_week??0} helper="Closure is the operating metric" icon="check" tone="success" onClick={()=>navigate('work')}/>
      <ExecMetric label="Cash to collect" value={loading?'—':formatMoney(cashToCollect,'USD')} helper={`${invoices.receivables||0} receivable${Number(invoices.receivables||0)===1?'':'s'}`} icon="money" tone={Number(invoices.overdue_count||0)>0?'danger':'neutral'} onClick={()=>navigate('cashflow')}/>
    </section>

    {wipOver>0&&<StateBanner tone="warning" title={`Personal WIP guardrail exceeded: ${personalDoing.length} active items`}>
      You are {wipOver} over the personal WIP limit of {wipLimit}. Agent-owned execution is excluded; finish, delegate or stop personal work before pulling in another major item.
    </StateBanner>}

    {criticalSignals.length>0&&<section className="exec-exceptions" aria-label="Critical exceptions">
      <div className="exec-section-title">
        <div><span className="exec-panel-kicker">Exception lane</span><h2>Critical exceptions</h2><p>High-severity operational signals that need remediation, not executive reclassification.</p></div>
        <button onClick={()=>navigate('operations')}>Operations <Icon name="arrow" size={14}/></button>
      </div>
      <div className="exec-exception-list">
        {criticalSignals.map(signal=>{
          const href=safeActionHref(signal.action_url);
          return <div className="exec-exception" key={signal.id}>
            <div><strong>{signal.title}</strong><span>{signal.summary||signal.source||'Operational attention required.'}</span></div>
            <Pill tone={String(signal.severity).toLowerCase()==='critical'?'danger':'warning'}>{signal.severity}</Pill>
            {href?<a href={href}>Remediate <Icon name="arrow" size={13}/></a>:<button onClick={()=>navigate('operations')}>Remediate <Icon name="arrow" size={13}/></button>}
          </div>;
        })}
      </div>
    </section>}

    <section className="exec-primary-grid">
      <article className="exec-panel exec-panel--decision">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">Only you</span><h2>Decide now</h2><p>Approvals, trade-offs and reviewed outputs that should not sit in execution.</p></div>
          <button onClick={()=>navigate('work')}>Open Work <Icon name="arrow" size={14}/></button>
        </div>
        <div className="exec-list">
          {decisionQueue.length?decisionQueue.map(item=>{
            if(!item.signal)return <WorkLine key={item.id} item={item} onOpen={()=>navigate('work')} actionLabel={item.agent_state==='review'?'Review':'Decide'}/>;
            const href=safeActionHref(item.action_url);
            return <div className="exec-line" key={item.id}>
              <div className="exec-line-main"><div className="exec-line-title">{item.title}</div><div className="exec-line-meta"><span>{item.severity}</span><span>{item.decision_source}</span></div>{item.description&&<div className="exec-next">{item.description}</div>}</div>
              {href?<a className="exec-line-action" href={href}>Review<Icon name="arrow" size={14}/></a>:<button className="exec-line-action" onClick={challengeQueue}>Review<Icon name="arrow" size={14}/></button>}
            </div>;
          }):<EmptyState icon="target" title="No executive decisions waiting" body="Execution can continue without your intervention."/>}
        </div>
      </article>

      <article className="exec-panel exec-panel--market">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">External pull</span><h2>Move to market</h2><p>Qualified demand, submissions, clients and collections outrank internal invention.</p></div>
          <button onClick={()=>navigate('opportunities',{view:'pipeline'})}>Pipeline <Icon name="arrow" size={14}/></button>
        </div>
        <div className="exec-market-section">
          <div className="exec-subhead"><span>Opportunities</span><strong>{marketOpportunities.length}</strong></div>
          <div className="exec-list">
            {marketOpportunities.length?marketOpportunities.map(item=><OpportunityLine key={item.id} item={item} onOpen={()=>navigate('opportunities',{view:'pipeline'})}/>)
              :<EmptyState icon="target" title="No active market movement" body="Use Opportunities to qualify demand before creating more product work."/>}
          </div>
        </div>
        {marketWork.length>0&&<div className="exec-market-section">
          <div className="exec-subhead"><span>Work that must ship</span><strong>{marketWork.length}</strong></div>
          <div className="exec-list">{marketWork.slice(0,3).map(item=><WorkLine key={item.id} item={item} onOpen={()=>navigate('work')} actionLabel="Ship"/>)}</div>
        </div>}
      </article>
    </section>

    <section className="exec-secondary-grid">
      <article className="exec-panel">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">Closure</span><h2>Finish what is started</h2><p>Protect active delivery from novelty. Personal WIP excludes work already executing with agents.</p></div>
          <Pill tone={wipOver?'warning':'success'}>WIP {personalDoing.length}/{wipLimit}</Pill>
        </div>
        <div className="exec-list">
          {finishQueue.length?finishQueue.map(item=><WorkLine key={item.id} item={item} onOpen={()=>navigate('work')} actionLabel="Finish"/>)
            :<EmptyState icon="check" title="No completion queue" body="There is no personal execution competing for closure."/>}
        </div>
      </article>

      <article className="exec-panel">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">Leverage</span><h2>Delegated engine</h2><p>Agents execute scoped work. It returns to you only for evidence review, blockers or judgment.</p></div>
          <button onClick={()=>navigate('agents')}>Agents <Icon name="arrow" size={14}/></button>
        </div>
        <div className="exec-list">
          {delegated.length?delegated.map(item=><WorkLine key={item.id} item={item} onOpen={()=>navigate(item.agent_state==='review'?'work':'agents')} actionLabel={item.agent_state==='review'?'Review':'Inspect'}/>)
            :<EmptyState icon="users" title="No delegated work in flight" body="Move suitable drafting, research and review work to agents instead of carrying it personally."/>}
        </div>
      </article>
    </section>

    <details className="exec-backlog">
      <summary>
        <div><span className="exec-panel-kicker">Subtraction</span><strong>Backlog drag</strong><small>Old internal work with no deadline, market signal or executive-decision requirement.</small></div>
        <Pill tone={parkCandidates.length?'warning':'success'}>{parkCandidates.length} candidate{parkCandidates.length===1?'':'s'}</Pill>
      </summary>
      <div className="exec-backlog-body">
        {parkCandidates.length?<div className="exec-list">{parkCandidates.map(item=><div className="exec-line" key={item.id}><div className="exec-line-main"><div className="exec-line-title">{item.title}</div><div className="exec-line-meta"><span>{item.project_name||'No project'}</span><span>{daysOpen(item)}d open</span><span>{item.priority||'medium'}</span></div></div><button className="exec-line-action" onClick={()=>navigate('work')}>Triage<Icon name="arrow" size={14}/></button></div>)}</div>
          :<EmptyState icon="check" title="No obvious backlog drag" body="Open work is currently tied to deadlines, market movement, active delivery or decisions."/>}
      </div>
    </details>
  </div>;
}
