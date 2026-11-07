const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
function loadModel(path) {
 let ts;
 try { ts=require('typescript'); } catch { return require(path); }
 const code=ts.transpileModule(fs.readFileSync(require.resolve(path),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const mod={exports:{}}; new Function('module','exports',code)(mod,mod.exports); return mod.exports;
}
const model=loadModel('../lib/equity-report/model.ts');
const original=fs.readFileSync(__dirname+'/equity-report.cjs','utf8');
const source=original.slice(original.indexOf('function fixture()'),original.indexOf("test('valid fixture"));
const fixture=new Function('SECTION_TITLES','REQUIRED_ASSETS',source+'return fixture;')(model.SECTION_TITLES,model.REQUIRED_ASSETS);
function recovery(){return {...fixture(),publication_mode:'automatic_recovery',generated_at:'2026-10-25T09:00:00+09:00',recovery_verified_at:'2026-10-25T08:59:00+09:00',recovery_reason:'Source correction verified',published_at:'2026-10-25T09:01:00+09:00'};}
test('normal draft publication gate and Sunday retry preserve original issue',()=>{
 assert.equal(model.publicationDecision(fixture(),null,'2026-10-24',new Date('2026-10-24T07:00:00+09:00')),'create');
 assert.equal(model.publicationDecision(fixture(),null,'2026-10-24',new Date('2026-10-25T23:59:59+09:00')),'create');
 for(const time of ['2026-10-24T06:59:59+09:00','2026-10-26T00:00:00+09:00'])assert.throws(()=>model.validatePublication(fixture(),'2026-10-24',new Date(time)));
});
test('automatic recovery accepts true Sunday timestamps with full original-period data',()=>{
 const r=recovery(),now=new Date('2026-10-25T09:01:00+09:00');
 assert.equal(model.publicationDecision(r,null,r.published_date,now),'create');
 assert.equal(model.publicationDecision(r,structuredClone(r),r.published_date,now),'unchanged');
 assert.throws(()=>model.publicationDecision(r,{...r,headline:'conflict'},r.published_date,now));
});
test('recovery rejects missing audit metadata, stale/forward data, future writes and partial coverage',()=>{
 const mutations=[r=>delete r.recovery_verified_at,r=>r.recovery_reason='',r=>r.generated_at='2026-10-26T00:00:00+09:00',r=>r.recovery_verified_at='2026-10-25T10:00:00+09:00',r=>r.recovery_authorized_at=r.generated_at,r=>r.generated_at='2026-10-24T06:30:00+09:00',r=>r.dashboard.pop(),r=>r.dashboard[0].points[1].date='2026-10-24',r=>r.dashboard[0].as_of='2026-10-18T06:00:00+09:00',r=>r.published_at='2026-10-25T08:00:00+09:00',r=>r.published_at='2026-10-25T10:00:00+09:00'];
 for(const mutate of mutations){const r=recovery();mutate(r);assert.throws(()=>model.validatePublication(r,r.published_date,new Date('2026-10-25T09:01:00+09:00')));}
});
test('manual recovery stays parseable but excluded from automation',()=>{
 const r={...fixture(),publication_mode:'manual_recovery',generated_at:'2026-10-24T19:30:00+09:00',recovery_authorized_at:'2026-10-24T19:00:00+09:00',recovery_reason:'Explicit request',published_at:'2026-10-24T19:31:00+09:00'};
 assert.equal(model.parseEquityReport(r,'2026-10-24.json').publication_mode,'manual_recovery');
 assert.throws(()=>model.validatePublication(r,r.published_date,new Date('2026-10-24T20:00:00+09:00')),/manual recovery/);
});
test('late draft without recovery mode and premature final timestamps remain rejected',()=>{
 assert.throws(()=>model.parseEquityReport({...fixture(),generated_at:'2026-10-24T07:00:00+09:00'},'2026-10-24.json'));
 assert.throws(()=>model.parseEquityReport({...fixture(),published_at:'2026-10-24T06:59:59+09:00'},'2026-10-24.json'));
});
test('macro publication timestamp is optional, zoned and weekend gated',()=>{
 const macro=loadModel('../lib/weekly-report/model.ts');
 const r={published_date:'2026-10-24',title:'Test',headline:'Test',body_markdown:'Test'};
 assert.equal(macro.parseWeeklyReport(r,'2026-10-24.json').published_at,undefined);
 assert.equal(macro.parseWeeklyReport({...r,published_at:'2026-10-25T23:59:59+09:00'},'2026-10-24.json').published_at,'2026-10-25T23:59:59+09:00');
 for(const at of ['2026-10-24T06:59:59+09:00','2026-10-26T00:00:00+09:00','2026-10-24T08:00:00','invalid'])assert.throws(()=>macro.parseWeeklyReport({...r,published_at:at},'2026-10-24.json'));
});
