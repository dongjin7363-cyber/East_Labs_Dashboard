const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const dates=(from,to)=>{const out=[];for(let d=new Date(from);d<=new Date(to);d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));return out;};
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:id=>mocks[id],fetch:mocks.fetch,AbortSignal,URL,Date,Intl,console});return exports;}
const benchmark=load('lib/asset-trend/benchmark.ts',{'@/lib/date/calendar':{getDatesInRange:dates}});
const config=load('lib/asset-trend/index-history-config.ts');
function route(fetch){return load('app/api/index-history/route.ts',{'@/lib/asset-trend/benchmark':benchmark,'@/lib/asset-trend/index-history-config':config,'@/lib/utils/date':{getDatesInRange:dates},'next/server':{NextResponse:{json:(data,options)=>({data,...options})}},fetch});}
test('one-year lookback includes 14-day baseline and successful primary skips slow fallbacks',async()=>{
 const calls=[];const r=route(async url=>{calls.push(url);assert.ok(url.includes('api.stock.naver.com'));return {ok:true,json:async()=>[{localDate:'20260924',closePrice:100}]};});
 const result=await r.GET(new Request('http://test/api?from=2025-09-11&to=2026-09-25'));
 assert.equal(result.data.errors.length,0);assert.equal(calls.length,4);assert.ok(calls.some(u=>u.includes('/foreign/index/.IXIC/')));assert.equal(result.data.series.nasdaq.length,1);
});
test('Nasdaq fallback works without blocking other successful sources',async()=>{
 const r=route(async url=>{if(url.includes('/.IXIC/'))throw Error('primary down');if(url.includes('fred'))return {ok:true,text:async()=> 'DATE,NASDAQCOM\n2026-09-24,20000'};return {ok:true,json:async()=>[{localDate:'20260924',closePrice:100}]};});
 const result=await r.GET(new Request('http://test/api?from=2026-09-01&to=2026-09-25'));assert.equal(result.data.series.nasdaq[0].close,20000);assert.equal(result.data.errors.length,0);
});
test('Nasdaq normalizes to its own previous close and remains unknown when absent',()=>{
 const series=benchmark.createEmptyIndexHistorySeries();series.nasdaq=[{date:'2026-09-23',close:100},{date:'2026-09-24',close:110},{date:'2026-09-25',close:121}];
 const result=benchmark.buildAssetTrendBenchmarkData({snapshots:[],indexSeries:series,compareStartDate:'2026-09-24',compareEndDate:'2026-09-25'});
 assert.ok(Math.abs(result.summary.nasdaq.periodReturnPct-21)<1e-9);assert.ok(Math.abs(result.summary.nasdaq.dailyReturnPct-10)<1e-9);assert.equal(result.summary.sp500.periodReturnPct,null);
});
