const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/super-stock/presentation.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleResult = { exports: {} };
vm.runInNewContext("(function(module,exports){" + output + "\n})")(moduleResult, moduleResult.exports);
const { recentRawRows, scoreAxis } = moduleResult.exports;
const date = (i) => new Date(Date.parse("2026-08-14") + i * 7 * 86400000).toISOString().slice(0, 10);
const prices = Array.from({ length: 10 }, (_, i) => ({date: date(i), close: 100 + i * 10, volume: 1000 + i}));
const spy = prices.map((p, i) => ({...p, close: 200 + i * 5}));
const snapshot = {ticker: "TEST", week_date: "2026-10-17", super_score: 70, quality_score: 30, delta_score: 28,
  research: {origin: "cloud_weekly", prices: [...prices].reverse(), spy_prices: spy}};
test("last five weeks have complete returns without historical assessments", () => {
  const rows = recentRawRows(snapshot, [snapshot]);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].week, "2026-09-19");
  assert.equal(rows[4].week, "2026-10-17");
  rows.forEach((r, i) => {
    const index = i + 5;
    assert.equal(r.price.date, date(index));
    assert.equal(r.return1w, (prices[index].close / prices[index - 1].close - 1) * 100);
    assert.equal(r.return4w, (prices[index].close / prices[index - 4].close - 1) * 100);
    assert.equal(r.spyReturn4w, (spy[index].close / spy[index - 4].close - 1) * 100);
    assert.equal(r.excess4w, r.return4w - r.spyReturn4w);
  });
  assert.equal(rows[0].score, undefined);
  assert.equal(rows[4].score.super_score, 70);
});
test("future snapshots and other tickers cannot alter a selected week", () => {
  const future = {...snapshot, week_date: "2026-10-24", research: {...snapshot.research, prices: prices.map(p => ({...p, close: 999}))}};
  const other = {...future, ticker: "OTHER", week_date: "2026-10-10"};
  assert.equal(JSON.stringify(recentRawRows(snapshot, [future, other, snapshot])), JSON.stringify(recentRawRows(snapshot, [snapshot])));
});
test("holiday weeks use the final available session and identical benchmark dates", () => {
  const holiday = prices.map((p, i) => i === 8 ? {...p, date: "2026-10-08"} : p);
  const holidaySpy = spy.map((p, i) => i === 8 ? {...p, date: "2026-10-08"} : p);
  const h = {...snapshot, research: {...snapshot.research, prices: holiday, spy_prices: holidaySpy}};
  assert.equal(recentRawRows(h, [h])[3].price.date, "2026-10-08");
  assert.equal(recentRawRows(h, [h])[4].return1w, (190 / 180 - 1) * 100);
  h.research.spy_prices = spy;
  assert.equal(recentRawRows(h, [h])[3].spyReturn4w, null);
});
test("missing base prices stay missing; zero returns and zero volume remain valid", () => {
  const flat = prices.map(p => ({...p, close: 100, volume: 0}));
  const h = {...snapshot, research: {...snapshot.research, prices: flat}};
  assert.equal(recentRawRows(h, [h])[4].return4w, 0);
  assert.equal(recentRawRows(h, [h])[4].price.volume, 0);
  h.research.prices = flat.slice(6);
  assert.equal(recentRawRows(h, [h])[4].return4w, null);
  assert.equal(recentRawRows(h, [h])[0].price, undefined);
});
test("both axes tightly bound points, including flat and edge datasets", () => {
  const x = scoreAxis([23, 31, 35.5]);
  assert.ok(x.min < 23 && x.min >= 21);
  assert.ok(x.max > 35.5 && x.max < 40);
  for (const values of [[30], [0], [40], [0, 40], []]) {
    const axis = scoreAxis(values);
    assert.ok(axis.min >= 0 && axis.max <= 40 && axis.max > axis.min);
    assert.ok(values.every(v => v >= axis.min && v <= axis.max));
    assert.ok(axis.ticks.every(v => v >= axis.min && v <= axis.max));
  }
  assert.equal(scoreAxis([30], true).min, 0);
  assert.equal(scoreAxis([30], true).max, 40);
});
