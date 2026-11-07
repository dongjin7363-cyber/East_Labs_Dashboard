const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual page callback against a fake clock, storage and quote endpoint.
const source = ts.createSourceFile('page.tsx', fs.readFileSync(path.join(__dirname,
  '../app/(routes)/portfolio/page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
const helpers = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'refreshQuotesForVisible') {
    callback = node.initializer.arguments[0].getText(source);
  }
  if (ts.isFunctionDeclaration(node) && ['parseStoredTimestamp', 'parseIsoTimestampMs'].includes(node.name?.text)) {
    helpers.push(node.getText(source));
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback);
const executable = ts.transpileModule(helpers.join('\n') + '\nconst run = ' + callback + '; run;', {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const now = Date.parse('2026-11-07T10:00:00Z');
const completedKey = 'pf_quote_refresh_completed_at_v1:A';
const legacyKey = 'pf_last_quote_refresh_at_v1';
function harness({ memory = new Map(), at = now, failAt = null, responseOk = true } = {}) {
  const result = { calls: 0, reloads: 0, at, memory, body: null };
  const noop = () => {};
  const context = {
    userId: 'A', lastQuoteFailAt: failAt, lastQuoteRefreshAt: null,
    quoteRefreshInFlightRef: { current: false }, quoteRefreshCompletedRef: { current: null },
    QUOTE_AUTO_REFRESH_INTERVAL_MS: 600_000, QUOTE_FAIL_COOLDOWN_MS: 600_000,
    QUOTE_FAILURE_TICKER_PREVIEW_LIMIT: 5,
    QUOTE_REFRESH_COMPLETED_STORAGE_KEY: 'pf_quote_refresh_completed_at_v1',
    LAST_QUOTE_REFRESH_STORAGE_KEY: legacyKey, LAST_QUOTE_FAIL_STORAGE_KEY: 'pf_last_quote_fail_at_v1',
    Date: class extends Date { static now() { return result.at; } },
    window: { localStorage: { getItem: k => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) } },
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test' } } }) } },
    fetch: async (_, options) => {
      result.calls++; result.body = JSON.parse(options.body);
      return { ok: responseOk, status: responseOk ? 200 : 500,
        json: async () => ({ last_updated: '2026-11-06T20:00:00Z', updated_count: 1, failed: [] }) };
    },
    refresh: async () => { result.reloads++; },
    setIsRefreshingQuotes: noop, setQuoteWarning: noop, setQuoteRefreshSummary: noop,
    setLastQuoteRefreshAt: v => { context.lastQuoteRefreshAt = v; },
    setLastQuoteFailAt: v => { context.lastQuoteFailAt = v; },
  };
  result.run = vm.runInNewContext(executable, context);
  result.context = context;
  return result;
}

test('recent completion survives remounts and tab re-entry, then expires at ten minutes', async () => {
  const first = harness();
  await first.run();
  assert.equal(first.calls, 1);
  assert.equal(first.reloads, 1);
  assert.equal(first.memory.get(completedKey), String(now));
  // Old market timestamps must not trigger another request after the page remounts.
  const remount = harness({ memory: first.memory, at: now + 599_999 });
  await remount.run(); await remount.run();
  assert.equal(remount.calls, 0);
  remount.at = now + 600_000;
  await remount.run();
  assert.equal(remount.calls, 1);
});

test('existing refresh history is respected during migration', async () => {
  const h = harness({ memory: new Map([[legacyKey, String(now - 60_000)]]) });
  await h.run();
  assert.equal(h.calls, 0);
});

test('manual refresh bypasses the cooldown and preserves extended quote fetching', async () => {
  const h = harness({ memory: new Map([[completedKey, String(now)]]), failAt: now });
  await h.run({ force: true, includeExtended: true });
  assert.equal(h.calls, 1);
  assert.equal(h.body.includeExtended, true);
});

test('failure cooldown prevents repeated automatic attempts', async () => {
  const h = harness({ responseOk: false });
  await h.run(); await h.run();
  assert.equal(h.calls, 1);
  assert.equal(h.reloads, 0);
  assert.equal(h.memory.has(completedKey), false);
});

test('invalid and future stored timestamps cannot block automatic refresh', async () => {
  for (const value of ['invalid', '-1', String(now + 60_000)]) {
    const h = harness({ memory: new Map([[completedKey, value], [legacyKey, value]]) });
    await h.run();
    assert.equal(h.calls, 1);
  }
});

test('an in-flight refresh is not duplicated by a manual or automatic request', async () => {
  const h = harness();
  h.context.quoteRefreshInFlightRef.current = true;
  await h.run(); await h.run({ force: true });
  assert.equal(h.calls, 0);
});
