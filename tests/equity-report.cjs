const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, aliases = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => aliases[name] || require(name), mod, mod.exports);
  return mod.exports;
}
const model = load('lib/equity-report/model.ts');
const { parseEquityReport, publicationDecision, weeklyChange, REQUIRED_ASSETS, SECTION_TITLES } = model;
const reportBody = load('components/weekly-report/ReportBody.tsx');
const { EquityBody } = load('components/equity-report/EquityBody.tsx', { '@/lib/equity-report/model': model, '@/components/weekly-report/ReportBody': reportBody });
function fixture() {
  return {
    schema_version: 1, report_type: 'east_weekly_equity', published_date: '2026-10-24',
    generated_at: '2026-10-24T06:30:00+09:00', cutoff_at: '2026-10-24T06:00:00+09:00',
    title: 'EAST Weekly Equity Report | TEST ONLY', headline: '검증용 합성 데이터 — 실제 시장 리포트 아님',
    body_markdown: SECTION_TITLES.map((s, i) => `## ${s}\n\n검증용 본문. [TEST](https://example.com/test)\n\n${i >= 2 ? '### Market Read-through\n\n검증용 해석.' : ''}`).join('\n\n'),
    dashboard: REQUIRED_ASSETS.map(id => ({ id, label: id.toUpperCase(), kind: /^(us|kr)\d/.test(id) ? 'yield' : 'price', unit: /^(us|kr)\d/.test(id) ? '%' : 'points', source_name: 'SYNTHETIC TEST', source_url: 'https://example.com/test', as_of: '2026-10-24T05:30:00+09:00', note: '', points: [{ date: '2026-10-16', value: 100 }, { date: '2026-10-23', value: 102 }] })),
  };
}
test('valid fixture; percentages and basis points computed from observations', () => {
  const r = parseEquityReport(fixture(), '2026-10-24.json');
  assert.ok(Math.abs(weeklyChange(r.dashboard[0]) - 2) < 1e-8);
  assert.ok(Math.abs(weeklyChange({ ...r.dashboard[4], points: [{date:'2026-10-16',value:4.1},{date:'2026-10-23',value:4.2}] }) - 10) < 1e-8);
});
test('blocks malformed, partial, stale and future data', () => {
  const mutations = [r => r.report_type = 'us_macro', r => r.published_date = '2026-10-25', r => r.generated_at = '2026-10-24T07:01:00+09:00', r => r.cutoff_at = '2026-10-24T07:00:00+09:00', r => r.dashboard.pop(), r => r.dashboard.push(r.dashboard[0]), r => r.dashboard[0].source_url = 'javascript:alert(1)', r => r.dashboard[0].points[1].value = NaN, r => r.dashboard[0].points[1].date = '2026-10-24', r => r.dashboard[0].points[0].date = '2026-10-19', r => r.dashboard[0].as_of = '2026-10-18T15:00:00+09:00', r => r.dashboard[4].kind = 'price', r => r.body_markdown = r.body_markdown.replace('### Market Read-through', '### Missing'), r => r.body_markdown = r.body_markdown.replace('## Regime', '## Wrong')];
  for (const mutate of mutations) { const r = fixture(); mutate(r); assert.throws(() => parseEquityReport(r, '2026-10-24.json')); }
});
test('publication is date gated, duplicate safe and conflict rejecting', () => {
  const r = fixture(), now = new Date('2026-10-24T07:00:00+09:00');
  assert.equal(publicationDecision(r, null, r.published_date, now), 'create');
  const reordered = Object.fromEntries(Object.entries(r).reverse());
  assert.equal(publicationDecision(r, reordered, r.published_date, now), 'unchanged');
  assert.throws(() => publicationDecision(r, {...r, headline: 'Conflict'}, r.published_date, now));
  assert.throws(() => publicationDecision(r, null, r.published_date, new Date('2026-10-24T06:59:59+09:00')));
  assert.throws(() => publicationDecision(r, null, r.published_date, new Date('2026-10-25T07:00:00+09:00')));
});
test('article renders all charts between 01 and 02 with safe sources and accessible observations', () => {
  const r = fixture();
  r.headline = '<script>bad</script>';
  const html = renderToStaticMarkup(React.createElement(EquityBody, { report: r }));
  assert.equal((html.match(/<svg /g) || []).length, 10);
  assert.ok(html.indexOf('📊 Weekly Market Dashboard') < html.indexOf('<svg'));
  assert.ok(html.lastIndexOf('</svg>') < html.indexOf('🏢 Equity Market &amp; Earnings'));
  assert.match(html, /<summary>관측치 · 출처<\/summary>/);
  assert.doesNotMatch(html, /Macro &amp; Economic Conditions/);
  assert.doesNotMatch(html, /<script>/);
});
test('equity loader is isolated from macro and drafts; real publications validate', () => {
  const source = fs.readFileSync('lib/equity-report/server.ts', 'utf8');
  assert.match(source, /"equity-reports"/);
  assert.doesNotMatch(source, /weekly-reports|equity-report-drafts/);
  for (const name of fs.readdirSync('data/equity-reports').filter(n => n.endsWith('.json'))) parseEquityReport(JSON.parse(fs.readFileSync(`data/equity-reports/${name}`, 'utf8')), name);
});
// Fixture generation is opt-in and writes only to the caller's temporary path.
if (process.env.EQUITY_TEST_FIXTURE) fs.writeFileSync(process.env.EQUITY_TEST_FIXTURE, JSON.stringify(fixture(), null, 2));

test('user-supplied historical issue retains provenance and cannot enter scheduled publication', () => {
  const archive = JSON.parse(fs.readFileSync('data/equity-reports/2026-10-24.json', 'utf8'));
  assert.equal(parseEquityReport(archive, '2026-10-24.json').schema_version, 2);
  assert.throws(() => model.validatePublication(archive, '2026-10-24', new Date('2026-10-24T07:00:00+09:00')), /cannot import an archive/);
  assert.throws(() => parseEquityReport({...archive, source_description: ''}, '2026-10-24.json'));
  assert.throws(() => parseEquityReport({...archive, imported_at: '2026-10-23T06:00:00+09:00'}, '2026-10-24.json'));
  const html = renderToStaticMarkup(React.createElement(EquityBody, {report: archive}));
  assert.doesNotMatch(html, /EAST \/ GLOBAL MARKET RESEARCH|GLOBAL CROSS-ASSET PERFORMANCE/);
  assert.doesNotMatch(html, /FELLAS|SYNTHETIC/);
  assert.match(html, /7,623.68/);
  assert.match(html, /<th scope="row">KOSPI<\/th>/);
  assert.match(html, /weekly-market-negative">-5bp/);
  assert.match(html, /<td class="weekly-market-value">4.69%<\/td>/);
  assert.equal(archive.performance.length, 7);
});

test('explicit late recovery renders with actual timestamp but cannot enter scheduled publication', () => {
  const r = {...fixture(), publication_mode: 'manual_recovery', generated_at:'2026-10-24T19:30:00+09:00', recovery_authorized_at:'2026-10-24T19:00:00+09:00', recovery_reason:'User explicitly requested recovery of missing issue.'};
  assert.equal(parseEquityReport(r,'2026-10-24.json').generated_at, r.generated_at);
  assert.throws(() => model.validatePublication(r,'2026-10-24',new Date('2026-10-24T20:00:00+09:00')), /cannot publish manual recovery/);
  assert.equal((renderToStaticMarkup(React.createElement(EquityBody,{report:r})).match(/<svg /g)||[]).length,10);
  for (const mutation of [
    x => delete x.recovery_authorized_at, x => x.recovery_reason='',
    x => x.recovery_authorized_at='2026-10-25T19:00:00+09:00',
    x => x.recovery_authorized_at='2026-10-24T20:00:00+09:00',
    x => x.generated_at='2026-10-25T06:00:00+09:00',
    x => x.generated_at='2026-10-24T06:30:00+09:00',
    x => x.publication_mode='unknown', x => x.dashboard=[],
    x => x.dashboard[0].as_of='2026-10-25T06:00:00+09:00',
  ]) {
    const invalid=structuredClone(r); mutation(invalid);
    assert.throws(()=>parseEquityReport(invalid,'2026-10-24.json'));
  }
});
