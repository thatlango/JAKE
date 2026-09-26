'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeAccounts,stageToOpportunityStage,dayDiffInclusive}=require('../server/revenue-sprint');

test('revenue sprint is exactly 30 days',()=>{
  assert.equal(dayDiffInclusive('2026-09-27','2026-10-26'),30);
});

test('pre-start snapshot stays on day one with all 30 days remaining',()=>{
  const summary=summarizeAccounts([],{
    starts_on:'2026-09-27',
    ends_on:'2026-10-26',
    cash_target_usd:10000
  },'2026-09-26');
  assert.equal(summary.day_number,1);
  assert.equal(summary.days_remaining,30);
});

test('summary keeps cash, contracts, proposals and weighted pipeline separate',()=>{
  const accounts=[
    {stage:'Proposal',pipeline_value_usd:10000,cash_30d_target_usd:5000,probability:40,proposal_sent:true,contracted_usd:0,cash_collected_usd:0,next_action_date:'2026-09-28'},
    {stage:'Contracted',pipeline_value_usd:5000,cash_30d_target_usd:3000,probability:90,proposal_sent:true,contracted_usd:5000,cash_collected_usd:2000,next_action_date:'2026-09-27'},
    {stage:'Lost',pipeline_value_usd:9000,cash_30d_target_usd:0,probability:0,proposal_sent:true,contracted_usd:0,cash_collected_usd:0,next_action_date:null}
  ];
  const summary=summarizeAccounts(accounts,{starts_on:'2026-09-27',ends_on:'2026-10-26',cash_target_usd:10000},'2026-10-01');
  assert.equal(summary.gross_pipeline_usd,15000);
  assert.equal(summary.weighted_pipeline_usd,8500);
  assert.equal(summary.proposal_value_usd,24000);
  assert.equal(summary.contracted_usd,5000);
  assert.equal(summary.cash_collected_usd,2000);
  assert.equal(summary.cash_gap_usd,8000);
  assert.equal(summary.target_progress_pct,20);
  assert.equal(summary.at_risk_count,2);
});

test('commercial stages sync into canonical opportunity stages',()=>{
  assert.equal(stageToOpportunityStage('Target'),'Watching');
  assert.equal(stageToOpportunityStage('Conversation'),'Pursuing');
  assert.equal(stageToOpportunityStage('Proposal'),'Drafting');
  assert.equal(stageToOpportunityStage('Negotiation'),'Decision');
  assert.equal(stageToOpportunityStage('Paid'),'Won');
  assert.equal(stageToOpportunityStage('Parked'),'Closed');
});


test('PostgreSQL-style Date objects are normalized for sprint boundaries and risk dates',()=>{
  const start=new Date('2026-09-27T00:00:00.000Z');
  const end=new Date('2026-10-26T00:00:00.000Z');
  const summary=summarizeAccounts([
    {stage:'Conversation',pipeline_value_usd:1000,probability:50,next_action_date:new Date('2026-09-30T00:00:00.000Z')}
  ],{starts_on:start,ends_on:end,cash_target_usd:10000},'2026-10-01');
  assert.equal(summary.total_days,30);
  assert.equal(summary.day_number,5);
  assert.equal(summary.at_risk_count,1);
});
