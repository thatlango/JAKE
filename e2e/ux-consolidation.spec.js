const { test, expect } = require('@playwright/test');

async function json(route, body, status=200){
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
}

async function installBase(page){
  await page.route('**/auth/session',route=>json(route,{authenticated:true,user:{name:'Jacob Odur',email:'jacob@example.com'}}));
  await page.route('**/api/overview',route=>json(route,{tasks:{completed_this_week:0},pipeline:{},invoices:{},attention_signals:[]}));
  await page.route('**/api/work/day',route=>json(route,{timezone:'Africa/Kampala',do_now:null,up_next:null,timeline:[]}));
  await page.route('**/api/work/today*',route=>json(route,{priorities:[],events:[]}));
  await page.route('**/api/work/inbox*',route=>json(route,{items:[]}));
  await page.route('**/api/work/items?*',route=>json(route,{items:[]}));
  await page.route('**/api/work/projects*',route=>json(route,{projects:[]}));
  await page.route('**/api/opportunities*',route=>json(route,{summary:{},opportunities:[],watches:[],proposals:[],sources:[]}));
  await page.route('**/api/revenue-sprint*',route=>json(route,{sprint:{cash_target_usd:10000},summary:{},accounts:[],due_actions:[],close_next:[],engine:{}}));
}

test('desktop navigation exposes every canonical JakeOS destination and profile is not a sign-out trap',async({page})=>{
  await installBase(page);
  let logoutCalls=0;
  await page.route('**/auth/logout',async route=>{logoutCalls++;await json(route,{ok:true});});
  await page.goto('/');
  for(const label of ['Voice capture','Personal finance','Platforms','Export','Estate Control','Operations']){
    await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:/Jacob Odur/}).click();
  await expect(page.getByRole('menuitem',{name:'Sign out'})).toBeVisible();
  expect(logoutCalls).toBe(0);
});

test('mobile More exposes estate control and operations instead of dropping valid destinations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await installBase(page);
  await page.goto('/');
  await page.getByRole('button',{name:'More',exact:true}).click();
  for(const label of ['Estate Control','Operations','Payments','Voice capture','Personal finance','Platforms','Export']){
    await expect(page.locator('.more-menu').getByRole('button',{name:label,exact:true})).toBeVisible();
  }
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('search opens the exact record route instead of only the parent module',async({page})=>{
  await installBase(page);
  await page.route('**/api/search?*',route=>json(route,{results:[{type:'work',id:'w-42',name:'Exact work item',subtitle:'Delivery'}]}));
  await page.goto('/?module=ai-search');
  await page.getByLabel('Search JakeOS').fill('Exact');
  await expect(page.getByText('Exact work item')).toBeVisible();
  await page.getByText('Exact work item').click();
  await expect(page).toHaveURL(/\/work\/w-42$/);
});

test('failed quick capture keeps the user text for retry',async({page})=>{
  await installBase(page);
  await page.route('**/api/work/items',async route=>{
    if(route.request().method()==='POST')return json(route,{error:'temporary failure'},503);
    return json(route,{items:[]});
  });
  await page.goto('/?module=work');
  const capture=page.getByPlaceholder('Capture a task, follow-up or commitment…');
  await capture.fill('Do not lose this capture');
  await page.getByRole('button',{name:'Capture',exact:true}).click();
  await expect(capture).toHaveValue('Do not lose this capture');
  await expect(page.getByText(/temporary failure|still here/i)).toBeVisible();
});

test('calendar keeps local commitments usable when Google Calendar is unavailable',async({page})=>{
  await installBase(page);
  const now=new Date().toISOString();
  await page.route('**/api/calendar/events',route=>json(route,{events:[{id:'local-1',title:'Local commitment',source:'jakeos',type:'meeting',starts_at:now,date:now.slice(0,10),done:false}]}));
  await page.route('**/api/gcal/status',route=>json(route,{error:'google unavailable'},503));
  await page.route('**/api/gcal/events',route=>json(route,{error:'google unavailable'},503));
  await page.goto('/?module=calendar');
  await expect(page.getByText('Local commitment')).toBeVisible();
  await expect(page.getByText(/External calendar source temporarily unavailable/)).toBeVisible();
});

test('cash-flow outage is explicit and is never rendered as a zero financial snapshot',async({page})=>{
  await installBase(page);
  await page.route('**/api/cashflow',route=>json(route,{error:'database unavailable'},503));
  await page.goto('/?module=cashflow');
  await expect(page.getByRole('heading',{name:'Cash flow'})).toBeVisible();
  await expect(page.getByText('Cash-flow data unavailable')).toBeVisible();
  await expect(page.getByText('Confirmed',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Retry'})).toBeVisible();
});

test('project deep route opens the selected project directly',async({page})=>{
  await installBase(page);
  await page.route('**/api/work/projects',route=>json(route,{projects:[{id:'p-2',name:'Second project',status:'Active',priority:'High',open_tasks:1,total_tasks:1,completed_tasks:0,blocked_tasks:0,doing_tasks:0}]}));
  await page.route('**/api/work/projects/p-2',route=>json(route,{project:{id:'p-2',name:'Second project',status:'Active',priority:'High',description:'Exact project'},summary:{total:1,completed:0,open:1,doing:0,blocked:0},items:[{id:'t-1',title:'Next action',status:'ready',priority:'high',version:1}]}));
  await page.goto('/projects/p-2');
  await expect(page).toHaveURL(/\/projects\/p-2$/);
  await expect(page.getByText('Exact project')).toBeVisible();
  await expect(page.getByText('Next action')).toBeVisible();
});


test('opportunity deep route opens the exact pursuit instead of only the workspace',async({page})=>{
  await installBase(page);
  await page.route('**/api/opportunities?*',route=>json(route,{summary:{active:1},watches:[],proposals:[],sources:[],opportunities:[{id:'opp-9',title:'Exact bid opportunity',org:'Buyer',stage:'Pursuing',opportunity_type:'RFP',audience:'Tuku-Tuku',fit_score:4.5,fit_status:'Strong fit',eligibility_status:'Eligible',assessment_status:'Verified',assessment_confidence:'High',notes:'Exact opportunity notes'}]}));
  await page.goto('/opportunities/opp-9');
  await expect(page).toHaveURL(/\/opportunities\/opp-9$/);
  await expect(page.getByText('Exact bid opportunity').first()).toBeVisible();
  await expect(page.getByText('Exact opportunity notes')).toBeVisible();
});

test('invalid routes show a recovery surface instead of silently becoming Executive',async({page})=>{
  await installBase(page);
  await page.goto('/this-route-does-not-exist');
  await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Search JakeOS'})).toBeVisible();
});
