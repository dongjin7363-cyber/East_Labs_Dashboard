const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Execute the real country-list renderer with mixed-market positions; no live account writes.
const source = ts.createSourceFile('page.tsx', fs.readFileSync(path.join(__dirname,
  '../app/(routes)/portfolio/page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const arrows = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['renderCountryHoldings', 'pnlToneClass'].includes(node.name.getText(source))) {
    arrows[node.name.getText(source)] = node.initializer.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
const executable = ts.transpileModule('const pnlToneClass = ' + arrows.pnlToneClass +
  '; const render = ' + arrows.renderCountryHoldings + '; render;', {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const positions = [
  { holding: { id: 'us-1', market: 'US', currency: 'USD', displayName: 'SOXL' }, computed: { marketValue: 597610, pnl: -442390, pnlRate: -42.54 }, dailyChangeRate: 12.48 },
  { holding: { id: 'kr-1', market: 'KR', currency: 'KRW', displayName: '국내 종목' }, computed: { marketValue: 4000000, pnl: 100000, pnlRate: 2.56 }, dailyChangeRate: null },
  { holding: { id: 'us-2', market: 'US', currency: 'USD', displayName: 'AAPL' }, computed: { marketValue: 120000, pnl: 12000, pnlRate: 11.11 }, dailyChangeRate: 1.82 },
];
function environment(rows = positions, loading = false) {
  const edits = [];
  const money = props => React.createElement('span', {
    'data-currency': props.currency, 'data-native-amount': props.amountInt,
  }, props.suffix);
  const render = vm.runInNewContext(executable, {
    require, exports: {}, loading, tableRows: rows, fxRate: 1356.68,
    resolveHoldingDisplayName: holding => holding.displayName,
    percentFormat: value => value.toFixed(2) + '%',
    DualCurrencyMoney: money, handleEdit: holding => edits.push(holding.id),
  });
  return { render, edits };
}

test('each country contains its own positions once and retains native-currency values and edit targets', () => {
  const { render, edits } = environment();
  const us = render('US');
  const kr = render('KR');
  assert.deepEqual(Array.from(us.props.children, button => button.props['aria-label']), ['SOXL 보유종목 편집', 'AAPL 보유종목 편집']);
  assert.deepEqual(Array.from(kr.props.children, button => button.props['aria-label']), ['국내 종목 보유종목 편집']);
  const html = renderToStaticMarkup(us);
  assert.match(html, /data-currency="USD" data-native-amount="597610"/);
  assert.match(html, /data-currency="USD" data-native-amount="-442390"/);
  assert.match(html, /data-currency="USD" data-native-amount="12000"/);
  assert.doesNotMatch(html, /국내 종목|🇺🇸|🇰🇷/);
  assert.match(renderToStaticMarkup(kr), /data-currency="KRW" data-native-amount="4000000"/);
  us.props.children[1].props.onClick();
  kr.props.children[0].props.onClick();
  assert.deepEqual(edits, ['us-2', 'kr-1']);
});

test('an empty country has no empty stock box and loading does not show stale stock names', () => {
  assert.equal(environment(positions.filter(row => row.holding.market === 'US')).render('KR'), null);
  const html = renderToStaticMarkup(environment(positions, true).render('US'));
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /SOXL|AAPL/);
});
