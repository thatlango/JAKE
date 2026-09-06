'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mobileHomeShape}=require('../server/mobile');

test('mobile home reports attention and avoids fabricated unavailable estate KPIs',()=>{
  const shaped=mobileHomeShape({
    generated_at:'2026-09-06T10:00:00.000Z',
    tasks:{open:4,doing:1,overdue:2,blocked:1},
    attention_signals:[{id:'a1',severity:'critical',title:'Disk high',summary:'Disk is high',source:'ops'}],
    estate:{available:false,stale:false,error:'upstream unavailable',totals:{},products:[],commerce:[]}
  },{score:72,status:'attention',summary:{servicesTotal:10,servicesHealthy:9}},[],null);
  assert.equal(shaped.commandSummary.count,1);
  assert.equal(shaped.commandSummary.severity,'critical');
  assert.equal(shaped.kpis.find(k=>k.key==='products').value,null);
  assert.equal(shaped.kpis.find(k=>k.key==='infrastructure').value,72);
  assert.equal(shaped.work.overdue,2);
});

test('mobile home exposes real estate totals when available',()=>{
  const shaped=mobileHomeShape({
    tasks:{},attention_signals:[],
    estate:{available:true,stale:false,totals:{products:12,activeUsers7d:321,realizedRevenueUGX:4500000},products:[],commerce:[]}
  },{score:100,status:'healthy',summary:{}},[],null);
  assert.equal(shaped.kpis.find(k=>k.key==='products').value,12);
  assert.equal(shaped.kpis.find(k=>k.key==='users7d').value,321);
  assert.equal(shaped.kpis.find(k=>k.key==='revenue').value,4500000);
  assert.equal(shaped.commandSummary.count,0);
});
