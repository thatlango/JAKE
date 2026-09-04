'use strict';
const db=require('./db');

const SCOPES=[
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');
const DEFAULT_TZ=process.env.JOBS_TIMEZONE||'Africa/Kampala';
let tokenStore={accessToken:null,accessTokenExpiry:0,refreshToken:process.env.GOOGLE_REFRESH_TOKEN||null,userEmail:process.env.GOOGLE_USER_EMAIL||null};

async function hydrate(){
  try{
    const[rt,em]=await Promise.all([
      db.get('settings',{eq:{key:'google_refresh_token'}}),
      db.get('settings',{eq:{key:'google_user_email'}})
    ]);
    if(rt?.value)tokenStore.refreshToken=rt.value;
    if(em?.value)tokenStore.userEmail=em.value;
  }catch(e){console.warn('[GCal] token hydrate failed:',e.message);}
  return getStatus();
}
function isConfigured(){return !!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);}
function isConnected(){return !!tokenStore.refreshToken;}
function buildAuthUrl(redirectUri){
  const params=new URLSearchParams({
    client_id:process.env.GOOGLE_CLIENT_ID,
    redirect_uri:redirectUri||process.env.GOOGLE_REDIRECT_URI,
    response_type:'code',scope:SCOPES,access_type:'offline',prompt:'consent',include_granted_scopes:'true'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
async function exchangeCode(code,redirectUri){
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:redirectUri||process.env.GOOGLE_REDIRECT_URI,grant_type:'authorization_code'})});
  const d=await r.json();
  if(d.error)throw new Error(d.error_description||d.error);
  tokenStore.accessToken=d.access_token;
  tokenStore.accessTokenExpiry=Date.now()+(Number(d.expires_in||3600)-60)*1000;
  if(d.refresh_token)tokenStore.refreshToken=d.refresh_token;
  try{
    const me=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:`Bearer ${tokenStore.accessToken}`}});
    tokenStore.userEmail=(await me.json()).email||null;
  }catch{}
  if(tokenStore.refreshToken)await db.insert('settings',{key:'google_refresh_token',value:tokenStore.refreshToken,updated_at:new Date().toISOString()},true);
  if(tokenStore.userEmail)await db.insert('settings',{key:'google_user_email',value:tokenStore.userEmail,updated_at:new Date().toISOString()},true);
  return{accessToken:tokenStore.accessToken,refreshToken:tokenStore.refreshToken,email:tokenStore.userEmail};
}
async function refreshAccessToken(){
  if(!tokenStore.refreshToken)throw new Error('No refresh token — reconnect Google Calendar');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({refresh_token:tokenStore.refreshToken,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,grant_type:'refresh_token'})});
  const d=await r.json();
  if(d.error)throw new Error(d.error_description||d.error);
  tokenStore.accessToken=d.access_token;
  tokenStore.accessTokenExpiry=Date.now()+(Number(d.expires_in||3600)-60)*1000;
  return tokenStore.accessToken;
}
async function getAccessToken(){if(tokenStore.accessToken&&Date.now()<tokenStore.accessTokenExpiry)return tokenStore.accessToken;return refreshAccessToken();}
async function googleJson(path,{method='GET',body}={}){
  const token=await getAccessToken();
  const r=await fetch(`https://www.googleapis.com/calendar/v3${path}`,{
    method,
    headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(20000)
  });
  if(r.status===204)return null;
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||`Google Calendar returned HTTP ${r.status}`);
  return d;
}
async function getCalendars(){return(await googleJson('/users/me/calendarList'))?.items||[];}
function mapEvent(event,calendarId='primary'){
  return{
    id:`gcal_${event.id}`,
    title:event.summary||'(No title)',
    date:(event.start?.dateTime||event.start?.date||'').slice(0,10),
    dateTime:event.start?.dateTime||null,
    endDate:(event.end?.dateTime||event.end?.date||'').slice(0,10),
    endDateTime:event.end?.dateTime||null,
    project:'Google Calendar',type:'gcal',gcalLink:event.htmlLink||null,location:event.location||null,
    desc:event.description||null,allDay:!event.start?.dateTime,done:false,source:'google',calendarId,
    colorId:event.colorId||null,etag:event.etag||null,googleUpdatedAt:event.updated||null,
    jakeosTaskId:event.extendedProperties?.private?.jakeosTaskId||null
  };
}
async function getEvents({calendarId='primary',days=60,maxResults=250}={}){
  const params=new URLSearchParams({timeMin:new Date().toISOString(),timeMax:new Date(Date.now()+days*86400000).toISOString(),maxResults:String(maxResults),singleEvents:'true',orderBy:'startTime'});
  const d=await googleJson(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return(d?.items||[]).map(event=>mapEvent(event,calendarId));
}
async function getAllEvents({days=60}={}){
  const calendars=await getCalendars(),out=[];
  for(const cal of calendars){
    if(cal.selected===false)continue;
    try{
      const events=await getEvents({calendarId:cal.id,days});
      out.push(...events.map(e=>({...e,calendarName:cal.summary,calendarColor:cal.backgroundColor})));
    }catch(e){console.warn(`[GCal] Could not fetch calendar ${cal.summary}:`,e.message);}
  }
  return out;
}
function eventBody({title,description='',start,end,timeZone=DEFAULT_TZ,jakeosTaskId}){
  const body={summary:title,description,start:{dateTime:new Date(start).toISOString(),timeZone},end:{dateTime:new Date(end).toISOString(),timeZone}};
  if(jakeosTaskId)body.extendedProperties={private:{jakeosTaskId:String(jakeosTaskId)}};
  return body;
}
async function createEvent({calendarId='primary',title,description='',start,end,timeZone=DEFAULT_TZ,jakeosTaskId}){
  if(!isConnected())throw new Error('Google Calendar is not connected');
  const body=eventBody({title,description,start,end,timeZone,jakeosTaskId});
  const d=await googleJson(`/calendars/${encodeURIComponent(calendarId)}/events`,{method:'POST',body});
  return mapEvent(d,calendarId);
}
async function updateEvent({calendarId='primary',eventId,title,description='',start,end,timeZone=DEFAULT_TZ,jakeosTaskId}){
  if(!isConnected())throw new Error('Google Calendar is not connected');
  const body=eventBody({title,description,start,end,timeZone,jakeosTaskId});
  const d=await googleJson(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,{method:'PATCH',body});
  return mapEvent(d,calendarId);
}
async function syncTask(task,{calendarId='primary'}={}){
  if(!isConnected()||!task?.scheduled_start||!task?.scheduled_end||['done','cancelled'].includes(String(task.status||'').toLowerCase()))return null;
  const link=(await db.query('SELECT * FROM task_calendar_links WHERE task_id=$1',[task.id])).rows[0]||null;
  const payload={calendarId,title:task.title,description:[task.description||'',`JakeOS task: ${task.id}`].filter(Boolean).join('\n\n'),start:task.scheduled_start,end:task.scheduled_end,timeZone:DEFAULT_TZ,jakeosTaskId:task.id};
  const event=link?await updateEvent({...payload,calendarId:link.calendar_id,eventId:link.google_event_id}):await createEvent(payload);
  await db.query(`INSERT INTO task_calendar_links(task_id,calendar_id,google_event_id,etag,last_google_updated_at,last_synced_at,updated_at) VALUES($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT(task_id) DO UPDATE SET calendar_id=EXCLUDED.calendar_id,google_event_id=EXCLUDED.google_event_id,etag=EXCLUDED.etag,last_google_updated_at=EXCLUDED.last_google_updated_at,last_synced_at=NOW(),updated_at=NOW()`,[task.id,event.calendarId,event.id.replace(/^gcal_/,''),event.etag,event.googleUpdatedAt]);
  return event;
}
function getStatus(){return{configured:isConfigured(),connected:isConnected(),email:tokenStore.userEmail,hasToken:!!tokenStore.accessToken,tokenValid:Date.now()<tokenStore.accessTokenExpiry,writeEnabled:true,scopes:SCOPES.split(' ')};}
function disconnect(){
  tokenStore={accessToken:null,accessTokenExpiry:0,refreshToken:null,userEmail:null};
  db.insert('settings',{key:'google_refresh_token',value:'',updated_at:new Date().toISOString()},true).catch(()=>{});
  db.insert('settings',{key:'google_user_email',value:'',updated_at:new Date().toISOString()},true).catch(()=>{});
}
module.exports={hydrate,isConfigured,isConnected,buildAuthUrl,exchangeCode,getAccessToken,getCalendars,getEvents,getAllEvents,createEvent,updateEvent,syncTask,getStatus,disconnect,tokenStore};
