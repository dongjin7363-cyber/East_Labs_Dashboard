// Execute real TypeScript modules with an in-memory browser and mocked network.
// No production credentials, browser profiles, or database writes are used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const holding = { id: 'holding-A', market: 'US', currency: 'USD', ticker: 'TEST', qty: 1,
  avgPrice: 10000, currentPrice: 11000, sector: 'Other', position: 'N', updatedAt: '2026-09-16T00:00:00Z' };

function environment() {
  const memory = new Map();
  const storage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v) };
  const context = { userId: 'A', cloud: [holding], fail: false, effects: [], slots: [], cursor: 0,
    fetch: async () => { throw new Error('offline'); }, process: { env: { NODE_ENV: 'test' }, cwd: () => root } };
  const react = {
    useCallback: f => f, useMemo: f => f(), useEffect: () => {},
    useState: initial => { const i=context.cursor++; if (!(i in context.slots)) context.slots[i]=initial;
      return [context.slots[i], next => { context.slots[i]=typeof next==='function'?next(context.slots[i]):next; }]; },
    useRef: initial => { const i=context.cursor++; if (!(i in context.slots)) context.slots[i]={current:initial}; return context.slots[i]; },
  };
  const mocks = {
    react,
    '@/lib/hooks/useAuth': {useAuth: () => ({userId:context.userId,isAuthenticated:!!context.userId,loading:false})},
    '@/lib/supabaseClient': {supabase:{}},
    '@/lib/services/events': {notifyFinanceDataChanged:()=>{},FINANCE_DATA_EVENT:'changed'},
    'next/server': {NextResponse:{json:(data, options)=>({data,status:options?.status??200,headers:options?.headers})}},
  };
  const cache = {};
  function load(file) {
    if(cache[file]) return cache[file].exports;
    const module={exports:{}}; cache[file]=module;
    const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const req=id=>{if(id in mocks)return mocks[id]; if(id.startsWith('@/'))return load(path.join(root,id.slice(2))+'.ts');
      if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts'); return require(id);};
    vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{
      window:{localStorage:storage,alert:()=>{},addEventListener:()=>{},removeEventListener:()=>{}},localStorage:storage,
      console:{info:()=>{},error:()=>{},warn:()=>{},log:()=>{}},process:context.process,fetch:(...args)=>context.fetch(...args),URL,Date,Map,Set,Promise,
    })(req,module,module.exports);
    return module.exports;
  }
  const repositories=load(path.join(root,'lib/repository/portfolioRepository.ts'));
  mocks['@/lib/repository/portfolioRepository']={...repositories,createPortfolioRepository:()=>({
    getHoldings:async()=>{if(context.fail)throw new Error('offline'); return context.getHoldings?context.getHoldings():context.cloud;},
    deleteHolding:async id=>{context.cloud=context.cloud.filter(h=>h.id!==id);},upsertHolding:async()=>{},
  })};
  const usePortfolio=load(path.join(root,'lib/hooks/usePortfolio.ts')).usePortfolio;
  context.render=()=>{context.cursor=0;return usePortfolio();};
  return {context,load,mocks,repositories,storage};
}

test('deleting the final holding clears the owned cache and stays empty offline',async()=>{
  const {context,repositories}=environment(); let hook=context.render(); await hook.refresh();
  hook=context.render(); assert.equal(hook.holdings.length,1);hook.remove(holding.id);await tick();
  await context.render().refresh();assert.equal(context.render().holdings.length,0);
  assert.equal((await new repositories.LocalPortfolioRepository('A').getHoldings()).length,0);
  context.fail=true;await context.render().refresh();assert.equal(context.render().holdings.length,0);
});

test('legacy and other-account holdings are never displayed or auto-imported',async()=>{
  const {context,repositories}=environment();
  await new repositories.LocalPortfolioRepository().upsertHolding(holding);
  await context.render().refresh();context.userId='B';context.cloud=[];
  assert.equal(context.render().holdings.length,0);
  await context.render().refresh();assert.equal(context.render().holdings.length,0);
  context.fail=true;await context.render().refresh();assert.equal(context.render().holdings.length,0);
  assert.equal((await new repositories.LocalPortfolioRepository('A').getHoldings()).length,1);
  assert.equal((await new repositories.LocalPortfolioRepository().getHoldings()).length,1);
});

test('only the current account cache is used on network failure',async()=>{
  const {context}=environment();await context.render().refresh();context.fail=true;
  await context.render().refresh();assert.equal(context.render().holdings[0].id,holding.id);
});

test('an in-flight account A response cannot populate account B after switching',async()=>{
  const {context}=environment();let resolveOld;
  context.getHoldings=()=>new Promise(resolve=>{resolveOld=resolve;});
  const pending=context.render().refresh();context.userId='B';delete context.getHoldings;context.cloud=[];
  await context.render().refresh();resolveOld([holding]);await pending;
  assert.equal(context.render().holdings.length,0);
});

test('cleared cloud metadata is not resurrected from an old owned cache',async()=>{
  const {context,repositories}=environment();
  await new repositories.LocalPortfolioRepository('A').upsertHolding({...holding,position:'OW',comment:'old'});
  await context.render().refresh();const current=context.render().holdings[0];
  assert.equal(current.position,'N');assert.equal(current.comment,undefined);
});

test('snapshot cash uses the current server account, including USD, and propagates load failures',async()=>{
  const {load,mocks,storage}=environment();let fail=false;
  storage.setItem('pf_deposit_krw_v1','99999999');
  mocks['@/lib/repository/portfolioAccountStateRepository']={SupabasePortfolioAccountStateRepository:class{
    constructor(userId){assert.equal(userId,'B');}
    async getState(){if(fail)throw new Error('database unavailable');return {depositKrwInt:1000000,depositUsdCents:10000,cashKrwInt:2000000};}
  }};
  const {loadSnapshotCash}=load(path.join(root,'lib/services/snapshotInputs.ts'));
  const cash=await loadSnapshotCash('B');assert.equal(cash.depositKrw+cash.cashKrw,3000000);assert.equal(cash.depositUsdCents,10000);
  fail=true;await assert.rejects(loadSnapshotCash('B'),/database unavailable/);
});

test('FX failure returns a non-cacheable 503 without a fabricated rate',async()=>{
  const {load}=environment();const response=await load(path.join(root,'app/api/fx/route.ts')).GET();
  assert.equal(response.status,503);assert.equal(response.data.rate,undefined);assert.equal(response.headers['Cache-Control'],'no-store');
});

test('FX success preserves the provider rate and update date',async()=>{
  const {context,load}=environment();context.fetch=async()=>({ok:true,json:async()=>({rates:{KRW:1420},time_last_update_utc:'Wed, 16 Sep 2026 00:00:00 GMT'})});
  const response=await load(path.join(root,'app/api/fx/route.ts')).GET();assert.equal(response.status,200);assert.equal(response.data.rate,1420);assert.equal(response.data.asOf,'2026-09-16');
});

test('snapshot writes cannot continue with a fallback rate when FX is unavailable',async()=>{
  const {context,load}=environment();context.fetch=async()=>({ok:false});
  const {fetchSnapshotFxRate}=load(path.join(root,'lib/services/snapshotInputs.ts'));
  await assert.rejects(fetchSnapshotFxRate(),/환율/);
});

test('a scheduled quote run with zero updates and failures exits with failure',async()=>{
  const {context,load,mocks}=environment();
  mocks['node:fs']={existsSync:()=>false};
  mocks['@/lib/quotes/update']={updatePortfolioQuotes:async()=>({updatedCount:0,failedCount:40,supabase:{updated:0,failed:0}})};
  load(path.join(root,'scripts/update-quotes.ts'));await tick();assert.equal(context.process.exitCode,1);
});

test('a successful quote run remains successful',async()=>{
  const {context,load,mocks}=environment();mocks['node:fs']={existsSync:()=>false};
  mocks['@/lib/quotes/update']={updatePortfolioQuotes:async()=>({updatedCount:40,failedCount:0,supabase:{updated:40,failed:0}})};
  load(path.join(root,'scripts/update-quotes.ts'));await tick();assert.equal(context.process.exitCode,undefined);
});

test('cash caches are isolated by account and preserve unowned legacy values',async()=>{
  const {load,storage}=environment();
  const {LocalPortfolioAccountStateRepository}=load(path.join(root,'lib/repository/portfolioAccountStateRepository.ts'));
  storage.setItem('pf_deposit_krw_v1','777');
  const a=new LocalPortfolioAccountStateRepository('A');
  const b=new LocalPortfolioAccountStateRepository('B');
  await a.upsertState({depositKrwInt:1000000,depositUsdCents:10000,cashKrwInt:2000000});
  assert.equal((await a.getState()).depositKrwInt,1000000);
  assert.equal((await b.getState()).depositKrwInt,0);
  assert.equal((await b.getState()).depositUsdCents,0);
  assert.equal(storage.getItem('pf_deposit_krw_v1'),'777');
});
