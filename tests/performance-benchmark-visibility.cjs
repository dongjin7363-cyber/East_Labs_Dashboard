const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Render the real chart: unselected indices must not affect its series or axis scale.
const source = ts.createSourceFile('page.tsx', fs.readFileSync(path.join(__dirname,
  '../app/(routes)/performance/page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pieces = [];
source.forEachChild(node => {
  if (ts.isFunctionDeclaration(node) && ['buildSmoothPath', 'BenchmarkLineChart'].includes(node.name?.text)) {
    pieces.push(node.getText(source));
  }
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (['SERIES_ORDER', 'SERIES_COLOR', 'SERIES_LABEL', 'DEFAULT_VISIBLE_BENCHMARKS'].includes(declaration.name.getText(source))) {
        pieces.push('const ' + declaration.getText(source) + ';');
      }
    }
  }
});
const executable = ts.transpileModule(pieces.join('\n') + '\n({ Chart: BenchmarkLineChart, defaultVisibility: DEFAULT_VISIBLE_BENCHMARKS });', {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const { Chart, defaultVisibility } = vm.runInNewContext(executable, {
  require, exports: {}, useState: React.useState, useRef: React.useRef, useEffect: React.useEffect,
});
const data = [
  { date: '2026-11-01', portfolio: 0, kospi: 0, kosdaq: 0, sp500: 0, nasdaq: 0 },
  { date: '2026-11-04', portfolio: -4, kospi: -2, kosdaq: 50, sp500: 1, nasdaq: 2 },
  { date: '2026-11-07', portfolio: -8, kospi: -3, kosdaq: 100, sp500: 2, nasdaq: 4 },
];
const visibility = key => ({ portfolio: true, kospi: key === 'kospi', kosdaq: key === 'kosdaq', sp500: key === 'sp500', nasdaq: key === 'nasdaq' });
const render = (points, selected) => renderToStaticMarkup(React.createElement(Chart, { data: points, visible: visibility(selected) }));

test('the chart renders Portfolio and only the selected benchmark', () => {
  const kospi = render(data, 'kospi');
  assert.equal((kospi.match(/data-series=/g) ?? []).length, 2);
  assert.match(kospi, /data-series="portfolio"/);
  assert.match(kospi, /data-series="kospi"/);
  assert.doesNotMatch(kospi, /data-series="(?:kosdaq|sp500|nasdaq)"/);
  const kosdaq = render(data, 'kosdaq');
  assert.match(kosdaq, /data-series="kosdaq"/);
  assert.doesNotMatch(kosdaq, /data-series="kospi"/);
  assert.notEqual(kospi, kosdaq);
});

test('extreme values in hidden indices do not distort the visible chart scale', () => {
  const extreme = data.map(point => ({ ...point, kosdaq: 999999, sp500: -999999, nasdaq: 999999 }));
  assert.equal(render(extreme, 'kospi'), render(data, 'kospi'));
});

test('missing benchmark points are not drawn as a fabricated zero return', () => {
  const missing = data.map(point => ({ ...point, kospi: null }));
  const html = render(missing, 'kospi');
  assert.match(html, /data-series="portfolio"/);
  assert.doesNotMatch(html, /data-series="kospi"/);
  assert.match(render([], 'kospi'), /선택한 기간의 비교 데이터가 없습니다/);
});


test('the default Performance comparison includes every original index with a distinct color', () => {
  const html = renderToStaticMarkup(React.createElement(Chart, { data, visible: { portfolio: true, ...defaultVisibility } }));
  const series = Array.from(html.matchAll(/<path[^>]*data-series="([^"]+)"[^>]*stroke="([^"]+)"/g));
  assert.deepEqual(series.map(match => match[1]), ['portfolio', 'kospi', 'kosdaq', 'sp500', 'nasdaq']);
  assert.equal(new Set(series.map(match => match[2])).size, 5);
});
