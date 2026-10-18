const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function loadTypeScript(filename) {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
  return mod.exports;
}
const { parseWeeklyReport, formatReportDate } = loadTypeScript('lib/weekly-report/model.ts');
const { ReportBody } = loadTypeScript('components/weekly-report/ReportBody.tsx');

test('rejects malformed publication dates and duplicate-week filenames', () => {
  const report = { published_date: '2026-10-18', title: 'US Weekly Macro', headline: 'Headline', body_markdown: 'Body' };
  assert.equal(parseWeeklyReport(report, '2026-10-18.json').published_date, '2026-10-18');
  assert.equal(parseWeeklyReport({ ...report, published_date: '2026-10-24' }, '2026-10-24.json').published_date, '2026-10-24');
  assert.equal(formatReportDate('2026-10-24'), '2026.10.24 · 토요일');
  assert.equal(formatReportDate('2026-10-18'), '2026.10.18 · 일요일');
  for (const date of ['2026-10-19', '2026-02-30', 'not-a-date']) {
    assert.throws(() => parseWeeklyReport({ ...report, published_date: date }, `${date}.json`));
  }
  assert.throws(() => parseWeeklyReport(report, '2026-10-11.json'));
  assert.throws(() => parseWeeklyReport({ ...report, body_markdown: '' }, '2026-10-18.json'));
});

test('renders data tables, emphasis and sources without executing report HTML or unsafe links', () => {
  const markdown = '## Key Data\n\n| 지표 | 실제 |\n| --- | --- |\n| CPI | **3.0%** |\n\n- [BLS](https://www.bls.gov)\n\n<script>alert(1)</script>\n[bad](javascript:alert)';
  const html = renderToStaticMarkup(React.createElement(ReportBody, { markdown }));
  assert.match(html, /<table>/);
  assert.match(html, /<strong>3.0%<\/strong>/);
  assert.match(html, /href="https:\/\/www.bls.gov"/);
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
});

test('all published files meet the same contract used by the website', () => {
  const directory = 'data/weekly-reports';
  for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.json'))) {
    parseWeeklyReport(JSON.parse(fs.readFileSync(`${directory}/${filename}`, 'utf8')), filename);
  }
});

test('Key Data compares signed numbers and normalized counts, leaving equal or unknown values neutral', () => {
  const markdown = `## Key Data

| 지표 | 실제치 | 예상치 |
| --- | --- | --- |
| Higher | **+0.3%** | +0.2% |
| Lower | −0.5% | -0.3% |
| Counts | 199K | 0.2M |
| Equal | 3.00% | 3.0% |
| Missing | — | 2% |
| Range | 1–2% | 1.5% |
| Mixed units | 3% | 3 |

## Market Read-through

| 지표 | 실제치 | 예상치 |
| --- | --- | --- |
| Unrelated | 5% | 4% |`;
  const html = renderToStaticMarkup(React.createElement(ReportBody, { markdown }));
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
  const row = name => rows.find(value => value.includes(`>${name}</th>`));
  assert.match(row('Higher'), /class="weekly-actual weekly-actual-above"/);
  assert.match(row('Lower'), /class="weekly-actual weekly-actual-below"/);
  assert.match(row('Counts'), /class="weekly-actual weekly-actual-below"/);
  for (const name of ['Equal', 'Missing', 'Range', 'Mixed units']) {
    assert.doesNotMatch(row(name), /weekly-actual-(above|below)/);
  }
  assert.match(html, /<th scope="row">Higher<\/th>/);
  assert.match(html, /aria-label="\+0.3% · 예상치 상회"/);
  assert.equal((html.match(/weekly-actual-above/g) || []).length, 1);
  assert.match(html, /<td>Unrelated<\/td><td>5%<\/td>/);
});

test('Key Data emphasizes actuals and interpretations with the requested heading', () => {
  for (const label of ['시장 의미', '마켓 해석']) {
    const markdown = `## Key Data\n\n| 지표 | 실제치 | 예상치 | ${label} |\n| --- | --- | --- | --- |\n| CPI | 3.0% | 3.0% | 근원물가 고착 |`;
    const html = renderToStaticMarkup(React.createElement(ReportBody, { markdown }));
    assert.match(html, /<th scope="col">마켓 해석<\/th>/);
    assert.doesNotMatch(html, />시장 의미</);
    assert.match(html, /<td class="weekly-actual">3.0%<\/td>/);
    assert.match(html, /<td class="weekly-interpretation">근원물가 고착<\/td>/);
  }
});

test('Market Read-through colors changes individually while preserving black prices', () => {
  const markdown = `## Market Read-through

| 자산 | 주간 변화 | 가격 |
| --- | --- | --- |
| Brent | **+4.9% / $109.86** | $109.86 |
| Treasury | 약 −15bp | 5.10% |
| Gold | -0.7% | $3,000 |
| Flat | 0.0% | 100 |

## Next Week

| 자산 | 주간 변화 |
| --- | --- |
| Other | +2.0% |`;
  const html = renderToStaticMarkup(React.createElement(ReportBody, { markdown }));
  assert.match(html, /<th scope="row">Brent<\/th>/);
  assert.match(html, /<strong><span class="weekly-market-positive">\+4.9%<\/span> \/ \$109.86<\/strong>/);
  assert.match(html, /weekly-market-negative">−15bp<\/span>/);
  assert.match(html, /weekly-market-negative">-0.7%<\/span>/);
  assert.match(html, /<td class="weekly-market-value">5.10%<\/td>/);
  assert.match(html, /<td class="weekly-market-value">0.0%<\/td>/);
  assert.match(html, /<td>Other<\/td><td>\+2.0%<\/td>/);
  assert.equal((html.match(/weekly-market-positive/g) || []).length, 1);
  assert.equal((html.match(/weekly-market-negative/g) || []).length, 2);
});
