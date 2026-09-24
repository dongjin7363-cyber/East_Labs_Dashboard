const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file, mocks={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {exports,require:id=>mocks[id],AbortSignal,fetch:mocks.fetch,Date});
  return exports;
}
const parse=load('lib/marketIndexes.ts');
test('US rows use actual S&P and Nasdaq indexes rather than ETF proxies',()=>{
  const result=parse.parseUsIndexes([
    {reutersCode:'SPY',closePrice:'650',fluctuationsRatio:'1'},
    {reutersCode:'.INX',closePrice:'6,500.12',fluctuationsRatio:'-0.45',localTradedAt:'2026-09-24T10:00:00-04:00'},
    {reutersCode:'.IXIC',closePrice:'22,345.67',fluctuationsRatio:'1.20'}]);
  assert.equal(result.sp500.price,6500.12);assert.equal(result.sp500.changePercent,-.45);
  assert.equal(result.nasdaq.price,22345.67);assert.equal(result.nasdaq.changePercent,1.2);
  assert.equal(parse.parseUsIndexes([{reutersCode:'SPY',closePrice:'650'}]).sp500,null);
});
test('missing change is unknown, never fabricated as flat; previous close can derive it',()=>{
  assert.equal(parse.parseIndexSnapshot({closePrice:'100'}).changePercent,null);
  assert.equal(parse.parseIndexSnapshot({closePrice:'101',lastClosePrice:100}).changePercent.toFixed(2),'1.00');
  for(const closePrice of ['',null,'invalid','0','-1','Infinity']) assert.equal(parse.parseIndexSnapshot({closePrice}),null);
});
test('each GET refetches all sources without caching and partial failure preserves valid indexes',async()=>{
  const calls=[];
  const route=load('app/api/market-index/route.ts',{
    '@/lib/marketIndexes':parse,
    'next/server':{NextResponse:{json:(data,options)=>({data,...options})}},
    fetch:async(url,options)=>{calls.push({url,options});if(url.includes('KOSDAQ'))throw Error('timeout');
      return {ok:true,json:async()=>url.includes('USA')?[{reutersCode:'.INX',closePrice:'6500',fluctuationsRatio:'1'},{reutersCode:'.IXIC',closePrice:'22000',fluctuationsRatio:'-1'}]:{closePrice:'3000',fluctuationsRatio:'0'}};}
  });
  const result=await route.GET();await route.GET();
  assert.equal(calls.length,6);assert.ok(calls.every(c=>c.options.cache==='no-store'&&c.options.signal));
  assert.match(result.headers['Cache-Control'],/no-store/);assert.equal(route.dynamic,'force-dynamic');
  assert.equal(result.data.kosdaq,null);assert.equal(result.data.kospi.price,3000);assert.equal(result.data.nasdaq.price,22000);
  assert.ok(Number.isFinite(Date.parse(result.data.fetchedAt)));
});
