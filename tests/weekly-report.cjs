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
const { parseWeeklyReport } = loadTypeScript('lib/weekly-report/model.ts');
const { ReportBody } = loadTypeScript('components/weekly-report/ReportBody.tsx');

test('rejects malformed publication dates and duplicate-week filenames', () => {
  const report = { published_date: '2026-10-18', title: 'US Weekly Macro', headline: 'Headline', body_markdown: 'Body' };
  assert.equal(parseWeeklyReport(report, '2026-10-18.json').published_date, '2026-10-18');
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
