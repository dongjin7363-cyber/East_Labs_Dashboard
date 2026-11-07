const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function editor(onSave) {
  const slots = []; let cursor = 0;
  const react = {
    useId: () => 'funds',
    useEffect: () => {},
    useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  };
  const input = () => null;
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const req = name => name === 'react' ? react : name === 'react-dom' ? { createPortal: child => child } : name === '@/components/FormattedNumberInput' ? { FormattedNumberInput: input }
      : name.startsWith('@/') ? load(path.join(root, name.slice(2)) + '.ts') : require(name);
    vm.runInNewContext('(function(require,module,exports){' + source + '\n})', {document:{body:{}}})(req, mod, mod.exports);
    return mod.exports;
  }
  const { PortfolioFundsCard } = load(path.join(root, 'components/portfolio/PortfolioFundsCard.tsx'));
  const props = { kind: 'deposit', krw: 4000000, usdCents: 12345, fxRate: 1356.68,
    amount: 'saved balance', disabled: false, onSave };
  let tree;
  const render = () => { cursor = 0; tree = PortfolioFundsCard(props); return tree; };
  function all(node) {
    if (arguments.length === 0) node = tree;
    if (node == null || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(all);
    return [node, ...all(node.props?.children)];
  }
  const find = label => all().find(n => n.props?.['aria-label'] === label);
  render();
  return { render, find, all, props, edit() { find('예수금 편집').props.onClick(); render(); } };
}

test('deposit edits stay local until save; cancel leaves saved amounts untouched', () => {
  const calls = []; const ui = editor((...args) => { calls.push(args); });
  ui.edit();
  ui.find('예수금 KRW').props.onValueChange('5000000');
  ui.find('예수금 USD').props.onValueChange('250.75');
  ui.render();
  assert.equal(calls.length, 0);
  assert.ok(ui.all().some(n => n.type === 'dialog'));
  const total = ui.all().find(n => n.props?.className === 'pf-funds-total');
  assert.match(JSON.stringify(total.props.children), /5,340,188/);
  ui.find('예수금 편집 취소').props.onClick(); ui.render();
  assert.equal(calls.length, 0);
  assert.equal(ui.find('예수금 KRW'), undefined);
  assert.ok(!ui.all().some(n => n.type === 'dialog'));
});

test('one confirmed save passes both currencies atomically, preserving USD cents', async () => {
  const calls = []; const ui = editor(async (...args) => { calls.push(args); }); ui.edit();
  ui.find('예수금 KRW').props.onValueChange('5000000');
  ui.find('예수금 USD').props.onValueChange('250.75'); ui.render();
  await ui.all().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); ui.render();
  assert.deepEqual(calls, [[5000000, 25075]]);
  assert.equal(ui.find('예수금 KRW'), undefined);
});

test('failed save preserves editable draft and displays an error', async () => {
  const ui = editor(async () => { throw Error('offline'); }); ui.edit();
  ui.find('예수금 USD').props.onValueChange('99.99'); ui.render();
  await ui.all().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); ui.render();
  assert.equal(ui.find('예수금 USD').props.value, '99.99');
  assert.ok(ui.all().some(n => n.props?.role === 'alert'));
});

test('cash editor has one KRW field and omits redundant cash subtitle', async () => {
  const calls = []; const ui = editor(async (...args) => { calls.push(args); });
  ui.props.kind = 'cash'; ui.props.krw = 3800000; ui.render();
  assert.ok(!ui.all().some(n => n.props?.className === 'pf-funds-caption'));
  ui.find('현금 편집').props.onClick(); ui.render();
  assert.equal(ui.find('예수금 USD'), undefined);
  ui.find('현금 KRW').props.onValueChange('3900000'); ui.render();
  await ui.all().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(calls, [[3900000, 0]]);
});
