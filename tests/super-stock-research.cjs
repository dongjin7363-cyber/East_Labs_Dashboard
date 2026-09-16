const {test}=require('node:test');
const assert=require('node:assert/strict');
const data=require('../data/super-stock/research-snapshots-20260916.json');
const prices=require('../data/super-stock/research-prices-20260916.json');
test('research has 31 equities × 5 Saturdays and all 34 actual price series',()=>{
 assert.equal(data.length,155); assert.equal(new Set(data.map(r=>r.ticker)).size,31);
 assert.equal(Object.keys(prices).length,34);
 assert.equal(new Set(data.map(r=>r.ticker+':'+r.week_date)).size,155);
 for(const row of data){assert.equal(new Date(row.week_date).getUTCDay(),6);assert.ok(!['SPY','QQQ','MAGS'].includes(row.ticker));}
});
test('all financial releases, events and price inputs predate their cutoff',()=>{
 for(const row of data){
  for(const e of row.evidence) assert.ok(Date.parse(e.published_at)<=Date.parse(row.research.cutoff), `${row.ticker} ${e.id}`);
  for(const f of row.research.releases) assert.ok(f.published_at<row.week_date);
  for(const p of row.research.prices) assert.ok(p.date<row.week_date);
 }
 const before=data.find(r=>r.ticker==='NVDA'&&r.week_date==='2026-08-22');
 const after=data.find(r=>r.ticker==='NVDA'&&r.week_date==='2026-08-29');
 assert.equal(before.research.releases.at(-1).metrics['분기 매출 (USD bn)'],81.615);
 assert.equal(after.research.releases.at(-1).metrics['분기 매출 (USD bn)'],96.2);
 assert.equal(data.find(r=>r.ticker==='DELL'&&r.week_date==='2026-08-29').research.releases.length,1);
 assert.equal(data.find(r=>r.ticker==='DELL'&&r.week_date==='2026-09-05').research.releases.length,2);
 assert.equal(data.find(r=>r.ticker==='ORCL'&&r.week_date==='2026-09-05').research.releases.length,1);
});
test('four week performance uses prices 28 calendar days apart, not four rows of arbitrary spacing',()=>{
 for(const s of data){const p=s.research.prices;assert.equal(Date.parse(p[0].date)-Date.parse(p.at(-1).date),28*86400000);assert.equal(Math.round((p[0].close/p.at(-1).close-1)*10000)/100,s.research.return_4w);}
});
test('score and weekly attribution reconcile; unknown inputs remain disclosed',()=>{
 for(const s of data){
  const expected=Math.round((s.quality_score/40*30+s.delta_score/40*45+s.narrative_momentum*.15+s.market_confirmation*.1)*10)/10;
  assert.equal(s.super_score,expected);
  const prev=data.find(r=>r.ticker===s.ticker&&Date.parse(s.week_date)-Date.parse(r.week_date)===7*86400000);
  if(prev)assert.ok(Math.abs(s.drivers.reduce((sum,d)=>sum+d.impact,0)-(s.super_score-prev.super_score))<.02);
  for(const k of s.research.missing.filter(k=>k!=='institutional_flows'))assert.equal(s.components[k].score,2.5);
 }
});
