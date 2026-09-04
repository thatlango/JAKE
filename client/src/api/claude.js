const BASE_SYSTEM=`You are the intelligence assistant inside JakeOS, a personal command center. Use only the current context supplied by JakeOS and the user's prompt. Never invent projects, finances, deadlines, relationships, product metrics or status. Distinguish observed facts from recommendations. Prioritise decisions, risks, dependencies and next actions. Be concise and operational.`;

export async function askClaude(messages,module='dashboard',extraContext=''){
  const systemPrompt=[BASE_SYSTEM,`\nCurrent JakeOS area: ${module}.`,extraContext?`\nLive context supplied by JakeOS:\n${extraContext}`:''].join('');
  try{
    const response=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,systemPrompt})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===503)return 'AI is not configured on JakeOS yet. The rest of this screen remains fully usable without it.';
      return `AI could not complete this request: ${data.error||response.statusText}`;
    }
    if(data.content?.[0]?.text)return data.content[0].text;
    if(data.error)return `AI could not complete this request: ${data.error}`;
    return 'AI returned no usable response.';
  }catch(error){return `AI is temporarily unreachable: ${error.message}`;}
}
