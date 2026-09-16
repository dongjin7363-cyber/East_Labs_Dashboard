// Offline, reproducible reconstruction from the dated source ledger. No invented history.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const moduleRef = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(root, 'lib/super-stock/model.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText)(moduleRef, moduleRef.exports);
const {QUALITY, DELTA, scores, validateAssessment} = moduleRef.exports;
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data/super-stock', name), 'utf8'));
const prices = read('research-prices-20260916.json');
const facts = read('research-fundamentals-20260916.json');
const events = read('research-events-20260916.json');
const weeks = ['2026-08-15','2026-08-22','2026-08-29','2026-09-05','2026-09-12'];
const r = x => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const offset = (date,n) => new Date(Date.parse(date) + n*86400000).toISOString().slice(0,10);
const output = [];
for (const ticker of Object.keys(facts)) {
  let previous = null;
  for (const week of weeks) {
    const cutoff = week+'T00:00:00Z';
    const known = facts[ticker].filter(f=>f.published_at < week);
    const f = known.at(-1);
    if (!f) throw Error('No point-in-time financials: '+ticker);
    const p = prices[ticker].rows.filter(p=>p.date<week).sort((a,b)=>b.date.localeCompare(a.date));
    const close = date => {const row=p.find(p=>p.date===date);if(!row)throw Error('Missing price '+ticker+' '+date);return row.close;};
    const fri=offset(week,-1), one=offset(fri,-7), four=offset(fri,-28);
    const ret1=r((close(fri)/close(one)-1)*100), ret4=r((close(fri)/close(four)-1)*100);
    const spy = date => prices.SPY.rows.find(p=>p.date===date).close;
    const spy4=r((spy(fri)/spy(four)-1)*100), excess=r(ret4-spy4);
    const rs = excess>=10?5:excess>=5?4.5:excess>=0?3.5:excess>=-5?2.5:excess>=-10?1.5:0.5;
    const available = events.filter(e=>e.tickers.includes(ticker)&&e.date<week);
    const recent = available.filter(e=>e.date>=offset(week,-28));
    const age = (Date.parse(week)-Date.parse(f.published_at))/86400000;
    const fresh=age<=7?1:age<=14?0.75:age<=28?0.5:0.25;
    const evidence=known.map((v,i)=>({id:'report'+i,headline:ticker+' 실적 발표 · '+v.published_at,source:ticker+' IR / 공시',source_type:'primary',url:v.url,published_at:v.published_at+'T23:59:00Z',summary:v.thesis,materiality:0.9,novelty:v===f?fresh:0.1,confidence:0.9,sentiment:'neutral'}));
    const reportIds=known.map((_,i)=>'report'+i);
    evidence.push({id:'price',headline:'기준일 종가·거래량',source:'Stock Analysis / S&P Global',source_type:'news',url:prices[ticker].url,published_at:fri+'T20:00:00Z',summary:`${fri} 종가 $${close(fri)}. 4주 가격수익률 ${ret4}%. 과거 거래일 자료를 9월 16일 조회.`,materiality:0.6,novelty:1,confidence:0.85,sentiment:'neutral'});
    evidence.push({id:'spy',headline:'SPY 비교 기준',source:'Stock Analysis / S&P Global',source_type:'news',url:prices.SPY.url,published_at:fri+'T20:00:00Z',summary:`동일 기간 SPY 가격수익률 ${spy4}%. 배당 제외.`,materiality:0.5,novelty:1,confidence:0.85,sentiment:'neutral'});
    available.forEach((e,i)=>evidence.push({id:'event'+i,headline:e.title,source:new URL(e.url).hostname,source_type:'primary',url:e.url,published_at:e.date+'T23:59:00Z',summary:e.summary,materiality:0.65,novelty:recent.includes(e)?0.8:0.2,confidence:0.8,sentiment:'positive'}));
    const allIds=[...reportIds,...available.map((_,i)=>'event'+i)];
    const components={}, missing=[];
    const notes={tam:'사업 적용 범위·수요 확장성',adoption:'매출·사용자·계약의 상용화 수준',revenue:'실제 매출 성장과 규모',margin:'GAAP 수익성 우선, 업종 차이 고려',fcf:'공개 현금흐름과 투자 소요',moat:'제품·플랫폼·제조 경쟁력',capital:'자금 여력과 투자·희석 부담'};
    QUALITY.slice(0,7).forEach((key,i)=>{
      const score=f.quality[i];
      if(score===null)missing.push(key);
      components[key]={score:score??2.5,reason:score===null?'이번 조사에서 해당 수치를 충분히 추출·검증하지 못함. 중립 2.5를 적용하며 우수하다는 의미가 아님.':`${notes[key]}에 대한 연구자 해석 ${score}/5. ${f.thesis} 리스크: ${f.risk}`,evidence_ids:reportIds};
    });
    components.rs={score:rs,reason:`4주 SPY 초과수익률 ${excess}pp. ≥10:5 / ≥5:4.5 / ≥0:3.5 / ≥−5:2.5 / ≥−10:1.5 / 그 미만:0.5.`,evidence_ids:['price','spy']};
    DELTA.slice(0,5).forEach((key,i)=>{
      const boost=recent.length&&['narrative_change','tam_expansion','product_mix'].includes(key)?0.5:0;
      components[key]={score:clamp(f.delta[i]+boost,0,5),reason:`공시에서 확인한 변화의 강도에 대한 정성 재평가. ${f.thesis}${boost?' 최근 28일 공시 이벤트 +0.5.':''} 발표가 없으면 기존 판단 유지.`,evidence_ids:allIds};
    });
    components.catalyst_density={score:Math.min(5,1+2*fresh+recent.length*0.5),reason:`최신 실적 발표 ${age}일 경과, 최근 28일 추가 공시 ${recent.length}건. 수집한 자료 범위의 촉매 밀도이며 전체 뉴스량이 아님.`,evidence_ids:allIds};
    components.expectation_gap={score:2.5,reason:'당시 컨센서스·밸류에이션 시계열을 확보하지 못해 중립 처리. 기대 차익 확인으로 해석하지 않음.',evidence_ids:reportIds};
    components.institutional_confirmation={score:rs,reason:`기관 순매수 자료 미확보. 가격 상대강도만 대용지표로 사용(${excess}pp); 기관 매수 확인을 뜻하지 않음.`,evidence_ids:['price','spy']};
    missing.push('expectation_gap','institutional_flows');
    const assessment={components,narrative_momentum:r(clamp(30+fresh*30+recent.length*10,0,100)),market_confirmation:r(clamp(50+excess*2+ret1,0,100)),confidence:r(Math.max(0.45,0.78-missing.length*0.04)),thesis:f.thesis,risks:[f.risk,'공개 실적·선별 공시 중심 재구성. 뉴스·리포트·소셜 전체를 복원한 결과가 아닙니다.'],drivers:[],evidence,research:{origin:'historical_reassessment',version:'historical-v1',researched_at:'2026-09-16',cutoff,limitations:['당시 작성된 점수가 아닌 과거 자료 재평가입니다.','선별 공시 기준이며 누락된 사건·기사와 사후 선택 편향이 있을 수 있습니다.','원문 발표일과 당시 공개 수치만 사용합니다. 현재 조회한 과거 주가는 사후 정정·분할 조정될 수 있습니다.','미확인 항목은 중립 2.5; 재무지표가 좋아 보인다는 뜻이 아닙니다.','공시 신규성 점수는 뉴스·소셜 심리의 대용 지표입니다.'],missing,releases:known.map(v=>({published_at:v.published_at,url:v.url,metrics:v.metrics})),prices:p.filter(v=>v.date>=four),price_url:prices[ticker].url,return_1w:ret1,return_4w:ret4,spy_return_4w:spy4,excess_4w:excess}};
    validateAssessment(assessment,new Date(cutoff));
    const score=scores(assessment);
    if(previous){
      const qualityDelta=(score.quality_score-previous.quality_score)*0.75;
      const deltaDelta=(score.delta_score-previous.delta_score)*1.125;
      assessment.drivers=[{label:'Quality 변화 기여',impact:r(qualityDelta),evidence_ids:allIds},{label:'Delta 변화 기여',impact:r(deltaDelta),evidence_ids:allIds},{label:'공시 신규성·시장 확인 변화 기여',impact:r(score.super_score-previous.super_score-qualityDelta-deltaDelta),evidence_ids:['price','spy',...allIds]}];
    }
    const snapshot={ticker,week_date:week,...assessment,...score,created_at:'2026-09-16T00:00:00Z'};
    output.push(snapshot); previous=snapshot;
  }
}
fs.writeFileSync(path.join(root,'data/super-stock/research-snapshots-20260916.json'),JSON.stringify(output,null,2)+'\n');
console.log(`Validated ${output.length} snapshots across ${Object.keys(facts).length} stocks and ${weeks.length} weeks.`);
