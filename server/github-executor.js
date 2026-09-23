'use strict';

function token(){return String(process.env.JAKEOS_GITHUB_TOKEN||process.env.GITHUB_TOKEN||'').trim();}
function configured(){return!!token();}
async function api(path,{method='GET',body}={}){
  if(!configured())throw Object.assign(new Error('GitHub executor credential is not configured'),{status:503});
  const r=await fetch(`https://api.github.com${path}`,{method,headers:{Authorization:`Bearer ${token()}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'JakeOS-Errands'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  if(r.status===204)return null;
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.message||`GitHub returned HTTP ${r.status}`),{status:r.status});
  return d;
}
const repoPath=repo=>String(repo||'').split('/').map(encodeURIComponent).join('/');
async function getFile({repo,path,ref='main'}){
  const d=await api(`/repos/${repoPath(repo)}/contents/${String(path||'').split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`);
  return{path:d.path,sha:d.sha,size:d.size,html_url:d.html_url,content:d.content?Buffer.from(d.content.replace(/\n/g,''),'base64').toString('utf8').slice(0,200000):'',encoding:d.encoding};
}
async function searchCode({repo,query,limit=10}){
  const d=await api(`/search/code?q=${encodeURIComponent(String(query||'').slice(0,300)+' repo:'+repo)}&per_page=${Math.max(1,Math.min(Number(limit)||10,30))}`);
  return(d.items||[]).map(x=>({name:x.name,path:x.path,sha:x.sha,html_url:x.html_url}));
}
async function createBranch({repo,branch,base='main'}){
  const ref=await api(`/repos/${repoPath(repo)}/git/ref/heads/${encodeURIComponent(base)}`);
  const d=await api(`/repos/${repoPath(repo)}/git/refs`,{method:'POST',body:{ref:`refs/heads/${branch}`,sha:ref.object.sha}});
  return{ref:d.ref,sha:d.object?.sha};
}
async function upsertFile({repo,path,branch,message,content,sha=null}){
  const body={message:String(message||'JakeOS errand update').slice(0,500),content:Buffer.from(String(content||'')).toString('base64'),branch:String(branch||'main')};
  if(sha)body.sha=sha;
  const d=await api(`/repos/${repoPath(repo)}/contents/${String(path||'').split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',body});
  return{content:{path:d.content?.path,sha:d.content?.sha,html_url:d.content?.html_url},commit:{sha:d.commit?.sha,html_url:d.commit?.html_url}};
}
async function createPr({repo,title,head,base='main',body=''}){
  const d=await api(`/repos/${repoPath(repo)}/pulls`,{method:'POST',body:{title:String(title||'JakeOS errand').slice(0,300),head,base,body:String(body||'').slice(0,20000)}});
  return{number:d.number,state:d.state,title:d.title,html_url:d.html_url,head_sha:d.head?.sha};
}
async function mergePr({repo,number,method='squash'}){
  const d=await api(`/repos/${repoPath(repo)}/pulls/${Number(number)}/merge`,{method:'PUT',body:{merge_method:['merge','squash','rebase'].includes(method)?method:'squash'}});
  return{merged:d.merged,sha:d.sha,message:d.message};
}
module.exports={configured,getFile,searchCode,createBranch,upsertFile,createPr,mergePr};
