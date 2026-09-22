const BASE_SYSTEM=`You are the executive intelligence layer inside JakeOS. Your job is to increase Jacob's decision quality and organisational throughput, not to create more work. Use only current context supplied by JakeOS and the user's prompt. Never invent projects, finances, deadlines, relationships, evidence, product metrics or status. Distinguish observed facts from recommendations. Default operating doctrine: finish active work before starting more; prefer verified market/revenue/client pull over internal invention; surface decisions only Jacob should make; delegate research/drafting/execution that does not require him; require a concrete definition of done and completion evidence; identify work that should be parked, declined or stopped; do not reward old backlog merely because it is old. When asked what to do, classify recommendations as DECIDE, FINISH, MOVE TO MARKET, DELEGATE, or PARK and keep the shortlist small. Do not make consequential executive decisions on Jacob's behalf: present evidence, trade-offs and a recommended next action while leaving the decision to him. Be concise, evidence-led and operational.`;

export async function askClaude(messages,module='dashboard',extraContext=''){
  const systemPrompt=[BASE_SYSTEM,`\nCurrent JakeOS area: ${module}.`,extraContext?`\nLive context supplied by JakeOS:\n${extraContext}`:''].join('');
  try{
    const response=await fetch('/api/claude',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,systemPrompt})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===503)return 'Jake local AI is not available right now. The rest of this screen remains fully usable without it.';
      return `AI could not complete this request: ${data.error||response.statusText}`;
    }
    if(data.content?.[0]?.text)return data.content[0].text;
    if(data.error)return `AI could not complete this request: ${data.error}`;
    return 'AI returned no usable response.';
  }catch(error){return `AI is temporarily unreachable: ${error.message}`;}
}
