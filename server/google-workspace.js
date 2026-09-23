'use strict';

const gcal=require('./gcal');

const EXTENDED_SCOPES=[
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive.readonly'
];

function enabled(){return ['true','1','on','yes'].includes(String(process.env.JAKEOS_GOOGLE_WORKSPACE_EXTENDED||'false').toLowerCase());}
function configured(){return enabled()&&gcal.isConfigured();}
function connected(){return configured()&&gcal.isConnected();}

async function googleJson(url,{method='GET',body,raw=false}={}){
  if(!connected())throw Object.assign(new Error('Google Workspace is not connected with extended scopes'),{status:503});
  const token=await gcal.getAccessToken();
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(raw){
    if(!r.ok)throw new Error(`Google API returned HTTP ${r.status}`);
    return r.text();
  }
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d?.error?.message||`Google API returned HTTP ${r.status}`),{status:r.status});
  return d;
}

function headersOf(message){
  return Object.fromEntries((message?.payload?.headers||[]).map(h=>[String(h.name||'').toLowerCase(),h.value||'']));
}
function simplifyMessage(message){
  const h=headersOf(message);
  return{id:message.id,thread_id:message.threadId,from:h.from||'',to:h.to||'',subject:h.subject||'',date:h.date||'',snippet:message.snippet||'',label_ids:message.labelIds||[]};
}

async function gmailSearch(query,{limit=10}={}){
  const params=new URLSearchParams({q:String(query||'').slice(0,500),maxResults:String(Math.max(1,Math.min(Number(limit)||10,25)))});
  const found=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`);
  const messages=[];
  for(const item of(found.messages||[]).slice(0,25)){
    const m=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
    messages.push(simplifyMessage(m));
  }
  return messages;
}

async function gmailReadThread(threadId){
  const thread=await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
  return{id:thread.id,history_id:thread.historyId,messages:(thread.messages||[]).map(simplifyMessage)};
}

const b64url=value=>Buffer.from(value).toString('base64url');
function rawEmail({to,subject,body,replyToMessageId=null}){
  const lines=[`To: ${String(to||'').replace(/[\r\n]/g,' ')}`,`Subject: ${String(subject||'').replace(/[\r\n]/g,' ')}`,'Content-Type: text/plain; charset="UTF-8"','MIME-Version: 1.0'];
  if(replyToMessageId)lines.push(`In-Reply-To: ${String(replyToMessageId).replace(/[\r\n]/g,' ')}`,`References: ${String(replyToMessageId).replace(/[\r\n]/g,' ')}`);
  lines.push('',String(body||'').slice(0,100000));
  return b64url(lines.join('\r\n'));
}
async function gmailCreateDraft(args){
  const d=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{method:'POST',body:{message:{raw:rawEmail(args),...(args.thread_id?{threadId:args.thread_id}:{})}}});
  return{id:d.id,message_id:d.message?.id,thread_id:d.message?.threadId};
}
async function gmailSend(args){
  const d=await googleJson('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',body:{raw:rawEmail(args),...(args.thread_id?{threadId:args.thread_id}:{})}});
  return{id:d.id,thread_id:d.threadId,label_ids:d.labelIds||[]};
}

async function driveSearch(query,{limit=10}={}){
  const safe=String(query||'').replace(/'/g,"\\'");
  const q=safe?`trashed=false and name contains '${safe}'`:'trashed=false';
  const params=new URLSearchParams({q,pageSize:String(Math.max(1,Math.min(Number(limit)||10,50))),fields:'files(id,name,mimeType,modifiedTime,webViewLink,size,owners(displayName,emailAddress))',orderBy:'modifiedTime desc'});
  const d=await googleJson(`https://www.googleapis.com/drive/v3/files?${params}`);
  return d.files||[];
}
async function driveRead(fileId){
  const meta=await googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,webViewLink,size`);
  let content='';
  if(meta.mimeType==='application/vnd.google-apps.document'){
    content=await googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text%2Fplain`,{raw:true});
  }else if(meta.mimeType==='application/vnd.google-apps.spreadsheet'){
    content=await googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text%2Fcsv`,{raw:true});
  }else if(/^text\//.test(meta.mimeType)||['application/json','text/csv'].includes(meta.mimeType)){
    content=await googleJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{raw:true});
  }
  return{...meta,content:String(content||'').slice(0,200000),content_available:Boolean(content)};
}

function status(){return{configured:configured(),connected:connected(),enabled:enabled(),scopes:EXTENDED_SCOPES};}
module.exports={EXTENDED_SCOPES,status,gmailSearch,gmailReadThread,gmailCreateDraft,gmailSend,driveSearch,driveRead};
