'use strict';

const {applyWipLimits,chooseDailyOutcomes,inferLane}=require('../server/portfolio');

describe('founder portfolio operating system',()=>{
  const base=(id,project,lane,score=3)=>({
    id,title:id,project_id:project,project_name:project,status:'ready',priority:'high',
    impact:score,strategic_weight:score,estimated_minutes:30,metadata:lane?{portfolio_lane:lane}:{}
  });

  test('enforces one SHIP initiative while keeping tasks in the selected initiative active',()=>{
    const rows=applyWipLimits([
      base('a1','lendflow','SHIP',5),
      base('a2','lendflow','SHIP',4),
      base('b1','impactos','SHIP',3)
    ]);
    expect(rows.filter(x=>x.portfolio_effective_lane==='SHIP').map(x=>x.project_id)).toEqual(['lendflow','lendflow']);
    expect(rows.find(x=>x.id==='b1').portfolio_effective_lane).toBe('PARKED');
  });

  test('allows up to three REVENUE initiatives',()=>{
    const rows=applyWipLimits([
      base('r1','one','REVENUE'),base('r2','two','REVENUE'),base('r3','three','REVENUE'),base('r4','four','REVENUE')
    ]);
    expect(new Set(rows.filter(x=>x.portfolio_effective_lane==='REVENUE').map(x=>x.project_id)).size).toBe(3);
    expect(rows.filter(x=>x.portfolio_effective_lane==='PARKED').length).toBe(1);
  });

  test('daily outcomes are capped at three',()=>{
    const rows=applyWipLimits([
      base('s','ship','SHIP',5),base('r','rev','REVENUE',5),base('w','work','WORK',5),base('l','learn','LEARN',5)
    ]);
    expect(chooseDailyOutcomes(rows)).toHaveLength(3);
  });

  test('infers market work as REVENUE',()=>{
    expect(inferLane({...base('x','x',null),metadata:{outcome_type:'market'}})).toBe('REVENUE');
  });
});
