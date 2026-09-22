import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Metric, Panel, Pill, StateBanner } from './ProductUI';
import './SearchConsoleHealth.css';

const tone=severity=>severity==='critical'?'danger':severity==='warning'?'warning':'neutral';
const number=value=>Number(value||0).toLocaleString();

export default function SearchConsoleHealth(){
  const[state,setState]=useState({loading:true,data:null,error:''});

  const load=useCallback(async(force=false)=>{
    setState(current=>({...current,loading:!current.data,error:''}));
    try{
      const response=await fetch(`/api/search-console/summary?days=28${force?'&refresh=1':''}`,{credentials:'same-origin',headers:{Accept:'application/json'}});
      const data=await response.json().catch(()=>null);
      if(!data)throw new Error('Search Console health returned no data.');
      setState({loading:false,data,error:response.ok?'':data.error||'Search Console health is unavailable.'});
    }catch(error){
      setState(current=>({...current,loading:false,error:error.message||'Search Console health is unavailable.'}));
    }
  },[]);

  useEffect(()=>{void load();},[load]);

  const data=state.data;
  const products=data?.summary?.products||[];
  const totals=useMemo(()=>{
    let clicks=0,impressions=0,positionWeight=0;
    for(const product of products){
      const row=product.totals||{};
      const productImpressions=Number(row.impressions||0);
      clicks+=Number(row.clicks||0);
      impressions+=productImpressions;
      positionWeight+=Number(row.position||0)*productImpressions;
    }
    return{
      clicks,impressions,
      ctr:impressions?clicks/impressions:0,
      position:impressions?positionWeight/impressions:0
    };
  },[products]);

  const alerts=data?.alerts||[];
  const healthy=data?.available&&data?.searchConsoleConfigured&&alerts.length===0;

  return <Panel
    title="Google Search visibility"
    subtitle="Estate Search Console health and organic-search coverage, read through Tuku Core."
    action={<Button variant="secondary" icon="refresh" onClick={()=>load(true)} disabled={state.loading}>{state.loading?'Refreshing…':'Refresh'}</Button>}
    className="estate-search-console"
  >
    {state.error&&<StateBanner tone="warning" title="Search Console status could not fully refresh">{state.error}</StateBanner>}

    {!data?.bridgeConfigured&&<StateBanner tone="warning" title="JakeOS Search Console bridge is not provisioned">The dedicated server-to-server Search Console key still needs to be added to JakeOS. No Google credential belongs in JakeOS.</StateBanner>}

    {data?.bridgeConfigured&&!data?.searchConsoleConfigured&&<StateBanner tone="warning" title="Google Search Console is not active yet">Tuku Core can be reached, but Google credentials and the Core enable flag still need to be completed before live search data is available.</StateBanner>}

    {healthy&&<StateBanner tone="success" title="Search Console is healthy">All configured estate product feeds returned without a Search Console health exception.</StateBanner>}

    <div className="estate-search-metrics">
      <Metric icon="estate" label="Mapped products" value={number(data?.productsConfigured)} helper="Approved URL scopes in Core"/>
      <Metric icon="search" label="Search clicks / 28d" value={number(totals.clicks)} helper="Google organic clicks"/>
      <Metric icon="chart" label="Impressions / 28d" value={number(totals.impressions)} helper="Google search appearances"/>
      <Metric icon="target" label="Average position" value={totals.impressions?totals.position.toFixed(1):'—'} helper={totals.impressions?`${(totals.ctr*100).toFixed(1)}% CTR`:'Awaiting live Search Console data'}/>
    </div>

    {alerts.length>0&&<div className="estate-search-alerts">
      <div className="px-brief-label">Needs attention</div>
      {alerts.map(alert=><div className="estate-search-alert" key={alert.code}>
        <Pill tone={tone(alert.severity)}>{alert.severity}</Pill>
        <div><strong>{alert.title}</strong><span>{alert.summary}</span></div>
      </div>)}
    </div>}

    {products.length>0&&<div className="estate-search-products">
      <div className="px-brief-label">Product feeds · last 28 days</div>
      <div className="estate-search-product-grid">
        {products.map(product=><div className="estate-search-product" key={product.productCode}>
          <div><strong>{product.productCode}</strong><span>{product.available?'Search data available':'Feed unavailable'}</span></div>
          <div className="estate-search-product-numbers"><b>{number(product.totals?.clicks)}</b><span>clicks</span><b>{number(product.totals?.impressions)}</b><span>impressions</span></div>
        </div>)}
      </div>
    </div>}
  </Panel>;
}
