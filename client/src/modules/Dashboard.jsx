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
const hasActiveAgent=item=>item.agent_name&&ACTIVE_AGENT_STATES.has(String(item.agent_state||'').toLowerCase());
const dueScore=value=>{
  const d=asDate(value);if(!d)return 0;
  const hours=(d-Date.now())/3600000;
  if(hours<0)return 30;if(hours<=24)return 25;if(hours<=72)return 18;if(hours<=168)return 10;return 0;
};
const opportunityScore=o=>(stageWeight[o.stage]||0)+(Number(o.fit_score||0)*8)+(Number(o.relevance_score||0)/10)+dueScore(o.deadline)+Math.min(10,Number(o.value_amount||0)/10000);

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

export default function Dashboard({openAI,navigate}){
  const[data,setData]=useState({overview:null,today:{priorities:[]},items:[],projects:[],opportunities:[]});
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const responses=await Promise.all([
        fetch('/api/overview'),
        fetch('/api/work/today?limit=20'),
        fetch('/api/work/items?limit=300'),
        fetch('/api/work/projects'),
        fetch('/api/opportunities?limit=300')
      ]);
      if(responses.some(r=>!r.ok))throw new Error('Executive operating picture could not be refreshed.');
      const[overview,today,work,projects,opportunities]=await Promise.all(responses.map(r=>r.json()));
      setData({
        overview,
        today,
        items:work.items||[],
        projects:projects.projects||[],
        opportunities:opportunities.opportunities||[]
      });
    }catch(e){setError(e.message||'JakeOS could not load the executive operating picture.');}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const overview=data.overview||{};
  const tasks=overview.tasks||{};
  const invoices=overview.invoices||{};
  const openItems=data.items.filter(item=>!['done','cancelled'].includes(String(item.status||'').toLowerCase()));
  const doing=openItems.filter(item=>item.status==='doing');
  const reviews=openItems.filter(item=>item.agent_state==='review');

  const decisionQueue=useMemo(()=>{
    const seen=new Set(),rows=[];
    reviews.forEach(item=>{seen.add(item.id);rows.push({...item,decision_source:'agent review'});});
    openItems.filter(needsDecision).forEach(item=>{if(!seen.has(item.id)){seen.add(item.id);rows.push({...item,decision_source:'work'});}});
    (overview.attention_signals||[]).filter(s=>['critical','high'].includes(String(s.severity||'').toLowerCase())).forEach(signal=>{
      const key='signal:'+signal.id;if(!seen.has(key)){seen.add(key);rows.push({id:key,title:signal.title,description:signal.summary,signal:true,severity:signal.severity,decision_source:'attention signal'});}
    });
    return rows.slice(0,6);
  },[openItems,reviews,overview.attention_signals]);

  const marketOpportunities=useMemo(()=>data.opportunities
    .filter(o=>!['Won','Lost','Closed'].includes(o.stage))
    .sort((a,b)=>opportunityScore(b)-opportunityScore(a))
    .slice(0,6),[data.opportunities]);

  const marketWork=useMemo(()=>openItems.filter(item=>isMarketWork(item)&&!hasActiveAgent(item))
    .sort((a,b)=>dueScore(b.due_at)-dueScore(a.due_at)||Number(b.priority==='critical')-Number(a.priority==='critical'))
    .slice(0,5),[openItems]);

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
  }).sort((a,b)=>daysOpen(b)-daysOpen(a)).slice(0,6),[openItems]);

  const marketMoves=marketWork.length+data.opportunities.filter(o=>ACTIVE_OPPORTUNITY_STAGES.has(o.stage)).length;
  const cashToCollect=Number(invoices.receivables_value||0);
  const wipLimit=3,wipOver=Math.max(0,doing.length-wipLimit);
  const finishPressure=Number(tasks.overdue||0)+Number(tasks.blocked||0)+doing.length;

  const challengeQueue=()=>openAI?.(
    'Act as my executive chief of staff. Challenge this JakeOS operating picture before I start anything new. Prioritise verified completion, revenue/market movement, client delivery and decisions only I can make. Identify what I should finish, delegate, park or decline. Do not reward novelty or old backlog merely because it exists.'
  );

  return <div className="module exec-dashboard">
    {error&&<StateBanner tone="danger" title="Executive view needs attention">{error}</StateBanner>}
    <header className="exec-head">
      <div>
        <div className="px-eyebrow">Executive operating system</div>
        <h1>Executive</h1>
        <p>Decide what matters. Move it to market. Finish before starting more.</p>
      </div>
      <div className="exec-head-actions">
        <Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>
        <Button icon="spark" onClick={challengeQueue}>Challenge my queue</Button>
      </div>
    </header>

    <section className="exec-rulebar" aria-label="Operating rules">
      <span><strong>1</strong> Finish active work</span>
      <span><strong>2</strong> Move revenue & clients</span>
      <span><strong>3</strong> Make only-your-call decisions</span>
      <span><strong>4</strong> Delegate execution</span>
      <span><strong>5</strong> Park the rest</span>
    </section>

    <section className="exec-metrics" aria-label="Executive metrics">
      <ExecMetric label="Decisions waiting" value={loading?'—':decisionQueue.length} helper={reviews.length?`${reviews.length} agent review${reviews.length===1?'':'s'} ready`:'Only-your-call queue'} icon="target" tone={decisionQueue.length?'warning':'neutral'} onClick={()=>navigate('work')}/>
      <ExecMetric label="Market moves" value={loading?'—':marketMoves} helper={`${overview.pipeline?.deadlines_14d||0} deadlines in 14d`} icon="chart" tone="brand" onClick={()=>navigate('opportunities',{view:'pipeline'})}/>
      <ExecMetric label="Completion pressure" value={loading?'—':finishPressure} helper={`${doing.length} active · ${tasks.overdue||0} overdue · ${tasks.blocked||0} blocked`} icon="check" tone={finishPressure?'warning':'neutral'} onClick={()=>navigate('work')}/>
      <ExecMetric label="Completed this week" value={loading?'—':tasks.completed_this_week??0} helper="Closure is the operating metric" icon="check" tone="success" onClick={()=>navigate('work')}/>
      <ExecMetric label="Cash to collect" value={loading?'—':formatMoney(cashToCollect,'USD')} helper={`${invoices.receivables||0} receivable${Number(invoices.receivables||0)===1?'':'s'}`} icon="money" tone={Number(invoices.overdue_count||0)>0?'danger':'neutral'} onClick={()=>navigate('cashflow')}/>
    </section>

    {wipOver>0&&<StateBanner tone="warning" title={`WIP guardrail exceeded: ${doing.length} active items`}>
      You are ${wipOver} over the executive WIP limit of {wipLimit}. Finish, delegate or stop active work before pulling in another major item.
    </StateBanner>}

    <section className="exec-primary-grid">
      <article className="exec-panel exec-panel--decision">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">Only you</span><h2>Decide now</h2><p>Approvals, trade-offs and reviewed outputs that should not sit in the execution queue.</p></div>
          <button onClick={()=>navigate('work')}>Open Work <Icon name="arrow" size={14}/></button>
        </div>
        <div className="exec-list">
          {decisionQueue.length?decisionQueue.map(item=>item.signal?
            <div className="exec-line" key={item.id}><div className="exec-line-main"><div className="exec-line-title">{item.title}</div><div className="exec-line-meta"><span>{item.severity}</span><span>{item.decision_source}</span></div>{item.description&&<div className="exec-next">{item.description}</div>}</div><button className="exec-line-action" onClick={challengeQueue}>Review<Icon name="arrow" size={14}/></button></div>
            :<WorkLine key={item.id} item={item} onOpen={()=>navigate('work')} actionLabel={item.agent_state==='review'?'Review':'Decide'}/>)
            :<EmptyState icon="target" title="No executive decisions waiting" body="Execution can continue without your intervention."/>}
        </div>
      </article>

      <article className="exec-panel exec-panel--market">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">External pull</span><h2>Move to market</h2><p>Opportunities, customers and revenue should outrank internal invention.</p></div>
          <button onClick={()=>navigate('opportunities',{view:'pipeline'})}>Pipeline <Icon name="arrow" size={14}/></button>
        </div>
        <div className="exec-list">
          {marketOpportunities.length?marketOpportunities.map(item=><OpportunityLine key={item.id} item={item} onOpen={()=>navigate('opportunities',{view:'pipeline'})}/>)
            :<EmptyState icon="target" title="No active market movement" body="Use Opportunities to qualify demand before creating more product work."/>}
        </div>
      </article>
    </section>

    <section className="exec-secondary-grid">
      <article className="exec-panel">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">Closure</span><h2>Finish what is started</h2><p>Active delivery and market work gets protected from new WIP.</p></div>
          <Pill tone={wipOver?'warning':'success'}>WIP {doing.length}/{wipLimit}</Pill>
        </div>
        <div className="exec-list">
          {finishQueue.length?finishQueue.map(item=><WorkLine key={item.id} item={item} onOpen={()=>navigate('work')} actionLabel="Finish"/>)
            :<EmptyState icon="check" title="No completion queue" body="There is no actionable work competing for closure."/>}
        </div>
      </article>

      <article className="exec-panel">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">Leverage</span><h2>Delegated engine</h2><p>Execution stays off your desk until a blocker or review needs you.</p></div>
          <button onClick={()=>navigate('agents')}>Agents <Icon name="arrow" size={14}/></button>
        </div>
        <div className="exec-list">
          {delegated.length?delegated.map(item=><WorkLine key={item.id} item={item} onOpen={()=>navigate(item.agent_state==='review'?'work':'agents')} actionLabel={item.agent_state==='review'?'Review':'Inspect'}/>)
            :<EmptyState icon="users" title="No delegated work in flight" body="Move suitable drafting, research and review work to agents instead of carrying it personally."/>}
        </div>
      </article>

      <article className="exec-panel exec-panel--park">
        <div className="exec-panel-head">
          <div><span className="exec-panel-kicker">Subtraction</span><h2>Candidates to park</h2><p>Old internal work with no deadline, market signal or executive decision requirement.</p></div>
          <button onClick={()=>navigate('work')}>Triage <Icon name="arrow" size={14}/></button>
        </div>
        <div className="exec-list">
          {parkCandidates.length?parkCandidates.map(item=><div className="exec-line" key={item.id}><div className="exec-line-main"><div className="exec-line-title">{item.title}</div><div className="exec-line-meta"><span>{item.project_name||'No project'}</span><span>{daysOpen(item)}d open</span><span>{item.priority||'medium'}</span></div></div><button className="exec-line-action" onClick={()=>navigate('work')}>Triage<Icon name="arrow" size={14}/></button></div>)
            :<EmptyState icon="check" title="No obvious backlog drag" body="The open queue is currently tied to deadlines, market movement, active delivery or decisions."/>}
        </div>
      </article>
    </section>

    {marketWork.length>0&&<section className="exec-market-work">
      <div className="exec-section-title"><div><span className="exec-panel-kicker">Supporting execution</span><h2>Market work that must ship</h2></div><button onClick={()=>navigate('work')}>Open all <Icon name="arrow" size={14}/></button></div>
      <div className="exec-market-work-grid">{marketWork.slice(0,4).map(item=><WorkLine key={item.id} item={item} onOpen={()=>navigate('work')} actionLabel="Ship"/>)}</div>
    </section>}
  </div>;
}
