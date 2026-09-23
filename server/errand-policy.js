'use strict';

const ACTION_CLASS=Object.freeze({
  READ:'read',
  INTERNAL_WRITE:'internal_write',
  EXTERNAL_WRITE:'external_write',
  EXECUTIVE:'executive'
});

const TOOL_CATALOG=Object.freeze({
  jakeos_search:{scope:'jakeos:read',actionClass:ACTION_CLASS.READ},
  jakeos_get_context:{scope:'jakeos:read',actionClass:ACTION_CLASS.READ},
  jakeos_list_work:{scope:'work:read',actionClass:ACTION_CLASS.READ},
  jakeos_create_work:{scope:'work:write',actionClass:ACTION_CLASS.INTERNAL_WRITE},
  jakeos_update_work:{scope:'work:write',actionClass:ACTION_CLASS.INTERNAL_WRITE},
  jakeos_list_opportunities:{scope:'opportunities:read',actionClass:ACTION_CLASS.READ},
  jakeos_update_opportunity:{scope:'opportunities:write',actionClass:ACTION_CLASS.INTERNAL_WRITE},
  jakeos_list_relationships:{scope:'crm:read',actionClass:ACTION_CLASS.READ},
  jakeos_create_followup:{scope:'crm:write',actionClass:ACTION_CLASS.INTERNAL_WRITE},
  google_calendar_list:{scope:'calendar:read',actionClass:ACTION_CLASS.READ},
  google_calendar_create:{scope:'calendar:write',actionClass:ACTION_CLASS.EXTERNAL_WRITE},
  google_drive_search:{scope:'drive:read',actionClass:ACTION_CLASS.READ},
  google_drive_read:{scope:'drive:read',actionClass:ACTION_CLASS.READ},
  gmail_search:{scope:'gmail:read',actionClass:ACTION_CLASS.READ},
  gmail_read_thread:{scope:'gmail:read',actionClass:ACTION_CLASS.READ},
  gmail_create_draft:{scope:'gmail:draft',actionClass:ACTION_CLASS.INTERNAL_WRITE},
  gmail_send:{scope:'gmail:send',actionClass:ACTION_CLASS.EXTERNAL_WRITE},
  github_get_file:{scope:'github:read',actionClass:ACTION_CLASS.READ},
  github_search_code:{scope:'github:read',actionClass:ACTION_CLASS.READ},
  github_create_branch:{scope:'github:write',actionClass:ACTION_CLASS.EXTERNAL_WRITE},
  github_upsert_file:{scope:'github:write',actionClass:ACTION_CLASS.EXTERNAL_WRITE},
  github_create_pr:{scope:'github:write',actionClass:ACTION_CLASS.EXTERNAL_WRITE},
  github_merge_pr:{scope:'github:merge',actionClass:ACTION_CLASS.EXECUTIVE},
  ops_request_action:{scope:'ops:write',actionClass:ACTION_CLASS.EXECUTIVE},
  access_request_change:{scope:'access:write',actionClass:ACTION_CLASS.EXECUTIVE},
  payment_request_action:{scope:'payments:write',actionClass:ACTION_CLASS.EXECUTIVE}
});

const DEFAULT_SCOPES=Object.freeze([
  'jakeos:read','work:read','work:write',
  'opportunities:read','opportunities:write',
  'crm:read','crm:write',
  'calendar:read',
  'drive:read','gmail:read','gmail:draft',
  'github:read'
]);

function normalizeScopes(scopes){
  const input=Array.isArray(scopes)?scopes:[];
  return [...new Set(input.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,64);
}

function toolPolicy(name){
  return TOOL_CATALOG[name]||null;
}

function toolAllowed(name,scopes){
  const policy=toolPolicy(name);
  if(!policy)return false;
  return normalizeScopes(scopes).includes(policy.scope);
}

function requiresApproval(name){
  const policy=toolPolicy(name);
  if(!policy)return true;
  return policy.actionClass===ACTION_CLASS.EXTERNAL_WRITE||policy.actionClass===ACTION_CLASS.EXECUTIVE;
}

function isExecutive(name){
  return toolPolicy(name)?.actionClass===ACTION_CLASS.EXECUTIVE;
}

function canAutoExecute(name,scopes){
  return toolAllowed(name,scopes)&&!requiresApproval(name);
}

function defaultScopesFor({outcomeType='',marketStage='',requestedAgentId=''}={}){
  const scopes=[...DEFAULT_SCOPES];
  const stage=String(marketStage||'').toLowerCase();
  const agent=String(requestedAgentId||'');
  if(['submit','deliver','collect','retain'].includes(stage))scopes.push('calendar:write');
  if(agent==='bid-partnerships'||agent==='document-knowledge')scopes.push('drive:read','gmail:read','gmail:draft');
  if(['software-engineering','qa-simulation','security-production-readiness','release-manager','platform-ops-sre'].includes(agent))scopes.push('github:read','github:write');
  if(String(outcomeType||'').toLowerCase()==='decision')scopes.push('jakeos:read');
  return normalizeScopes(scopes);
}

module.exports={ACTION_CLASS,TOOL_CATALOG,DEFAULT_SCOPES,normalizeScopes,toolPolicy,toolAllowed,requiresApproval,isExecutive,canAutoExecute,defaultScopesFor};
