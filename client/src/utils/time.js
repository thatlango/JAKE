export const APP_TIMEZONE='Africa/Kampala';

export function dateKey(value=new Date(),timeZone=APP_TIMEZONE){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=type=>parts.find(p=>p.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function timeKey(value=new Date(),timeZone=APP_TIMEZONE){
  const d=value instanceof Date?value:new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
}

function zoneOffsetMinutes(date,timeZone){
  try{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'longOffset',hour:'2-digit'}).formatToParts(date);
    const name=parts.find(p=>p.type==='timeZoneName')?.value||'GMT+00:00';
    const match=name.match(/GMT([+-])(\d{2}):(\d{2})/);
    if(!match)return 0;
    const mins=Number(match[2])*60+Number(match[3]);
    return match[1]==='-'?-mins:mins;
  }catch{return 0;}
}

export function zonedLocalToIso(date,time='09:00',timeZone=APP_TIMEZONE){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return null;
  const [year,month,day]=date.split('-').map(Number);
  const [hour,minute]=String(time||'09:00').split(':').map(Number);
  const guess=new Date(Date.UTC(year,month-1,day,hour||0,minute||0,0));
  const offset=zoneOffsetMinutes(guess,timeZone);
  return new Date(guess.getTime()-offset*60000).toISOString();
}
