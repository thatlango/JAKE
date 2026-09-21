import React from 'react';

const n=value=>Number.isFinite(Number(value))?Number(value):0;
const pct=(value,max)=>max>0?Math.max(0,Math.min(100,(n(value)/max)*100)):0;

export function HorizontalBars({data=[],valueFormatter=value=>String(value),ariaLabel='Bar chart'}){
  const safe=data.map(item=>({...item,value:n(item.value)}));
  const max=Math.max(1,...safe.map(item=>item.value));
  if(!safe.length)return <div className="cc-chart-empty">No data yet</div>;
  return <div className="cc-hbars" role="img" aria-label={ariaLabel}>
    {safe.map((item,index)=><div className="cc-hbar-row" key={item.key||item.label||index}>
      <div className="cc-hbar-label"><span className={`cc-legend-dot cc-series-${index%6}`}/><span>{item.label}</span></div>
      <div className="cc-hbar-track"><span className={`cc-hbar-fill cc-series-bg-${index%6}`} style={{width:`${Math.max(item.value?5:0,pct(item.value,max))}%`}}/></div>
      <strong>{valueFormatter(item.value)}</strong>
    </div>)}
  </div>;
}

export function MiniBars({data=[],ariaLabel='Activity chart'}){
  const values=data.map(item=>n(item.value));
  const max=Math.max(1,...values);
  if(!data.length)return <div className="cc-chart-empty">No activity yet</div>;
  return <div className="cc-mini-bars" role="img" aria-label={ariaLabel}>
    {data.map((item,index)=><div className="cc-mini-bar-wrap" key={item.key||item.label||index}>
      <div className="cc-mini-bar-track"><span className={`cc-mini-bar cc-series-bg-${index%6}`} style={{height:`${Math.max(item.value?8:2,pct(item.value,max))}%`}}/></div>
      <small>{item.label}</small>
    </div>)}
  </div>;
}

export function DonutChart({segments=[],centerValue,centerLabel,ariaLabel='Donut chart'}){
  const safe=segments.filter(item=>n(item.value)>0).map(item=>({...item,value:n(item.value)}));
  const total=safe.reduce((sum,item)=>sum+item.value,0);
  const r=48,c=2*Math.PI*r;
  let offset=0;
  if(!total)return <div className="cc-chart-empty">No distribution yet</div>;
  return <div className="cc-donut-wrap">
    <svg className="cc-donut" viewBox="0 0 120 120" role="img" aria-label={ariaLabel}>
      <circle cx="60" cy="60" r={r} fill="none" className="cc-donut-base" strokeWidth="13"/>
      {safe.map((item,index)=>{
        const length=c*(item.value/total);
        const dash=`${length} ${c-length}`;
        const el=<circle key={item.key||item.label||index} cx="60" cy="60" r={r} fill="none" className={`cc-donut-segment cc-series-stroke-${index%6}`} strokeWidth="13" strokeDasharray={dash} strokeDashoffset={-offset} strokeLinecap="butt"/>;
        offset+=length;
        return el;
      })}
    </svg>
    <div className="cc-donut-center"><strong>{centerValue??total}</strong><span>{centerLabel||'Total'}</span></div>
  </div>;
}

export function LineChart({data=[],series=[{key:'value',label:'Value'}],ariaLabel='Trend chart'}){
  const width=520,height=170,padX=18,padY=18;
  const rows=data.map(row=>({...row}));
  const values=rows.flatMap(row=>series.map(s=>n(row[s.key])));
  const max=Math.max(1,...values),min=Math.min(0,...values);
  const range=Math.max(1,max-min);
  if(rows.length<2)return <div className="cc-chart-empty">Not enough trend data yet</div>;
  const x=index=>padX+(index/(rows.length-1))*(width-padX*2);
  const y=value=>height-padY-((n(value)-min)/range)*(height-padY*2);
  return <div className="cc-line-chart-wrap">
    <svg className="cc-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
      {[0.25,0.5,0.75].map(v=><line key={v} x1={padX} x2={width-padX} y1={padY+(height-padY*2)*v} y2={padY+(height-padY*2)*v} className="cc-gridline"/>)}
      {series.map((s,seriesIndex)=>{
        const points=rows.map((row,index)=>`${x(index)},${y(row[s.key])}`).join(' ');
        return <g key={s.key}>
          <polyline points={points} fill="none" className={`cc-line cc-series-stroke-${seriesIndex%6}`} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
          {rows.map((row,index)=><circle key={index} cx={x(index)} cy={y(row[s.key])} r="3.5" className={`cc-point cc-series-fill-${seriesIndex%6}`}/>)}
        </g>;
      })}
    </svg>
    <div className="cc-line-labels">{rows.map((row,index)=><span key={index}>{row.label||''}</span>)}</div>
  </div>;
}

export function ProgressBar({value=0,max=100,label}){
  const percentage=pct(value,max);
  return <div className="cc-progress" aria-label={label||`${Math.round(percentage)} percent`}>
    <span style={{width:`${percentage}%`}}/>
  </div>;
}

export function Sparkline({values=[],ariaLabel='Trend'}){
  const data=values.map(n);
  if(data.length<2)return <span className="cc-sparkline-empty">—</span>;
  const width=100,height=28,max=Math.max(...data),min=Math.min(...data),range=Math.max(1,max-min);
  const points=data.map((value,index)=>`${(index/(data.length-1))*width},${height-2-((value-min)/range)*(height-4)}`).join(' ');
  return <svg className="cc-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
