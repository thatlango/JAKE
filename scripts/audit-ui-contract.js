'use strict';
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const active=[
  'client/src/App.jsx',
  'client/src/components/CommandCenter.jsx',
  'client/src/components/Sidebar.jsx',
  'client/src/components/MobileNav.jsx',
  'client/src/modules/AISearch.jsx',
  'client/src/modules/Accounts.jsx',
  'client/src/modules/Agents.jsx',
  'client/src/modules/AlertsSettings.jsx',
  'client/src/modules/CRMNext.jsx',
  'client/src/modules/Calendar.jsx',
  'client/src/modules/CashFlow.jsx',
  'client/src/modules/Dashboard.jsx',
  'client/src/modules/Estate.jsx',
  'client/src/modules/EstateControl.jsx',
  'client/src/modules/ExportCentre.jsx',
  'client/src/modules/Finance.jsx',
  'client/src/modules/Integrations.jsx',
  'client/src/modules/Operations.jsx',
  'client/src/modules/Opportunities.jsx',
  'client/src/modules/Payments.jsx',
  'client/src/modules/PersonalFinance.jsx',
  'client/src/modules/Platforms.jsx',
  'client/src/modules/Projects.jsx',
  'client/src/modules/RevenueSprint.jsx',
  'client/src/modules/VoiceMemo.jsx',
  'client/src/modules/Work.jsx'
];

const failures=[];
const report=(file,message)=>failures.push(`${file}: ${message}`);
for(const file of active){
  const full=path.join(root,file);
  const source=fs.readFileSync(full,'utf8');
  if(/(?:window\.)?confirm\s*\(/.test(source))report(file,'native confirm() is prohibited; use ConfirmDialog');
  if(/(?:window\.)?prompt\s*\(/.test(source))report(file,'native prompt() is prohibited; use a TDS field/dialog');
  if(/var\(--(?:text|surface|green|red|blue|accent)(?:\b|-)/.test(source))report(file,'legacy prototype color tokens are prohibited');
  if(/fontFamily\s*:\s*['"][^'"]*(?:Syne|DM Sans|JetBrains Mono)/.test(source))report(file,'legacy prototype typography is prohibited');
  if(/from ['"]\.\/components\/AIPanel|from ['"]\.\.\/components\/AIPanel/.test(source))report(file,'duplicate AIPanel surface is prohibited');
  if(/['"]\/api\/(?:clients|pipeline)['"]/.test(source))report(file,'legacy CRM/pipeline write endpoint is prohibited');
}

const app=fs.readFileSync(path.join(root,'client/src/App.jsx'),'utf8');
if(/jd-profile-chip[^>]*onClick=\{signOut\}/.test(app))report('client/src/App.jsx','profile chip must never sign out directly');
for(const legacyCss of ['client/src/index.css','client/src/product.css','client/src/sprint.css']){
  const css=fs.readFileSync(path.join(root,legacyCss),'utf8');
  if(/:root\s*\{/.test(css))report(legacyCss,'legacy structural CSS must not define global tokens; TDS owns them');
}
const main=fs.readFileSync(path.join(root,'client/src/main.jsx'),'utf8');
for(const removed of ['layout-fix.css','dashboard-reference.css','minimal-kpi-shell.css','sprint-modules.css','relationships.css']){
  if(main.includes(removed))report('client/src/main.jsx',`superseded stylesheet still loaded: ${removed}`);
}
const nav=fs.readFileSync(path.join(root,'client/src/navigation.js'),'utf8');
for(const required of ['voice-memo','personal-finance','platforms','export','estate-control','operations']){
  if(!nav.includes(`id: '${required}'`))report('client/src/navigation.js',`canonical navigation missing ${required}`);
}
if(failures.length){
  console.error('JakeOS UI contract failed:\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log(`JakeOS UI contract passed for ${active.length} active surfaces.`);
