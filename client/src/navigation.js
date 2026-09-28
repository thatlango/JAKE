export const NAV_GROUPS = [
  { label: 'Executive', items: [
    { id: 'dashboard', label: 'Executive', icon: 'grid' },
    { id: 'work', label: 'Work', icon: 'check' },
    { id: 'agents', label: 'Agents', icon: 'users' },
  ]},
  { label: 'Market', items: [
    { id: 'opportunities', label: 'Opportunities', icon: 'target' },
    { id: 'revenue-sprint', label: 'Revenue Mission', icon: 'chart' },
    { id: 'cashflow', label: 'Money', icon: 'money' },
    { id: 'finance', label: 'Revenue plan', icon: 'chart' },
    { id: 'crm', label: 'Relationships', icon: 'users' },
  ]},
  { label: 'Delivery', items: [
    { id: 'projects', label: 'Projects', icon: 'folder' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'voice-memo', label: 'Voice capture', icon: 'mic' },
  ]},
  { label: 'Estate', items: [
    { id: 'estate', label: 'Tuku Estate', icon: 'estate' },
    { id: 'estate-control', label: 'Estate Control', icon: 'target' },
    { id: 'operations', label: 'Operations', icon: 'chart' },
    { id: 'payments', label: 'Payments', icon: 'money' },
    { id: 'platforms', label: 'Platforms', icon: 'grid' },
  ]},
  { label: 'System', items: [
    { id: 'ai-search', label: 'Search', icon: 'search' },
    { id: 'accounts', label: 'Accounts', icon: 'users' },
    { id: 'integrations', label: 'Integrations', icon: 'link' },
    { id: 'alerts', label: 'Alerts', icon: 'bell' },
    { id: 'personal-finance', label: 'Personal finance', icon: 'money' },
    { id: 'export', label: 'Export', icon: 'upload' },
  ]},
];

export const MOBILE_PRIMARY = [
  { id: 'dashboard', label: 'Home', icon: 'home' },
  { id: 'work', label: 'Work', icon: 'check' },
  { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'estate', label: 'Estate', icon: 'estate' },
  { id: 'more', label: 'More', icon: 'dots' },
];

export const MOBILE_MORE = NAV_GROUPS
  .flatMap(group => group.items)
  .filter(item => !['dashboard','work','projects','estate'].includes(item.id));

export const KNOWN_MODULES = new Set([...NAV_GROUPS.flatMap(group => group.items.map(item => item.id)),'pipeline','radar','proposals','grants','not-found']);

export const MODULE_META = {
  dashboard:{title:'Executive',subtitle:'Now, decisions, market movement and verified completion'},
  agents:{title:'Agents',subtitle:'Live agent runs, blockers, evidence and decisions'},
  work:{title:'Work',subtitle:'Finish, delegate, evidence and close'},
  projects:{title:'Projects',subtitle:'Delivery, milestones and project health'},
  calendar:{title:'Calendar',subtitle:'Schedule, deadlines and commitments'},
  crm:{title:'Relationships',subtitle:'People, organisations and follow-ups'},
  cashflow:{title:'Money',subtitle:'Cash movement, invoices and financial attention'},
  opportunities:{title:'Opportunities',subtitle:'Qualify demand, pursue, submit and convert'},
  'revenue-sprint':{title:'Revenue Mission',subtitle:'Cash target, close queue and daily commercial execution'},
  estate:{title:'Tuku Estate',subtitle:'Products, usage and commercial signals'},
  'estate-control':{title:'Estate Control',subtitle:'Cross-product controls and estate status'},
  operations:{title:'Operations',subtitle:'Infrastructure, continuity and service health'},
  payments:{title:'Payments',subtitle:'Collections, movements and exceptions'},
  accounts:{title:'Accounts',subtitle:'Users, access and product activity'},
  finance:{title:'Revenue plan',subtitle:'Targets, pipeline economics and commercial direction'},
  'ai-search':{title:'Search',subtitle:'Search and interpret JakeOS operating context'},
  integrations:{title:'Integrations',subtitle:'Connected systems and data flows'},
  alerts:{title:'Alerts',subtitle:'Notification rules and operational signals'},
  platforms:{title:'Platforms',subtitle:'Tuku products and system access'},
  'voice-memo':{title:'Voice capture',subtitle:'Capture ideas and actions quickly'},
  'personal-finance':{title:'Personal finance',subtitle:'Personal cashflow and obligations'},
  export:{title:'Export',subtitle:'Reports, extracts and shareable outputs'},
  'not-found':{title:'Not found',subtitle:'This JakeOS route does not exist'}
};

const decode = value => {
  try { return decodeURIComponent(value); } catch { return value; }
};

export function readLocation(){
  const path = window.location.pathname.replace(/\/+$/,'') || '/';
  const routes = [
    [/^\/work\/([^/?#]+)$/i, 'work'],
    [/^\/projects\/([^/?#]+)$/i, 'projects'],
    [/^\/opportunities\/([^/?#]+)$/i, 'opportunities'],
    [/^\/relationships\/([^/?#]+)$/i, 'crm'],
    [/^\/accounts\/([^/?#]+)$/i, 'accounts'],
    [/^\/calendar\/([^/?#]+)$/i, 'calendar'],
    [/^\/revenue\/accounts\/([^/?#]+)$/i, 'revenue-sprint'],
  ];
  for (const [pattern,module] of routes) {
    const match = path.match(pattern);
    if (match) return { module, recordId: decode(match[1]), estateProduct: null };
  }
  if(path==='/estate/control') return {module:'estate-control',recordId:null,estateProduct:null};
  if(path==='/revenue-mission'||path==='/revenue-sprint') return {module:'revenue-sprint',recordId:null,estateProduct:null};
  const estate = path.match(/^\/estate(?:\/([^/?#]+))?$/i);
  if(estate) return {module:'estate',recordId:null,estateProduct:estate[1]?decode(estate[1]).toLowerCase():null};
  if(path!=='/') return {module:'not-found',recordId:null,estateProduct:null};
  const requested = new URLSearchParams(window.location.search).get('module') || 'dashboard';
  return {module:KNOWN_MODULES.has(requested)?requested:'not-found',recordId:new URLSearchParams(window.location.search).get('id'),estateProduct:null};
}

export function moduleUrl(module, params={}){
  const id = params.id == null ? null : encodeURIComponent(String(params.id));
  if(module==='dashboard') return '/';
  if(module==='estate') return '/estate';
  if(module==='estate-control') return '/estate/control';
  if(module==='revenue-sprint') return id ? `/revenue/accounts/${id}` : '/revenue-mission';
  if(id && module==='work') return `/work/${id}`;
  if(id && module==='projects') return `/projects/${id}`;
  if(id && module==='opportunities') return `/opportunities/${id}`;
  if(id && module==='crm') return `/relationships/${id}`;
  if(id && module==='accounts') return `/accounts/${id}`;
  if(id && module==='calendar') return `/calendar/${id}`;
  const query = new URLSearchParams({module});
  Object.entries(params||{}).forEach(([key,value])=>{
    if(key!=='id'&&value!==undefined&&value!==null&&String(value)!=='') query.set(key,String(value));
  });
  return `/?${query.toString()}`;
}
