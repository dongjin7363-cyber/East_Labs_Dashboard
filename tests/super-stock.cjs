const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const path = require("node:path");
function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  vm.runInNewContext("(function(require,module,exports){" + js + "\n})", {
    Date,
    URL,
    Set,
    Map,
    Buffer,
    AbortSignal,
    process,
    console,
    fetch,
    ...globals,
  })(
    (id) => {
      if (id in mocks) return mocks[id];
      throw Error(id);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const m = load("lib/super-stock/model.ts");
function assessment() {
  return {
    components: Object.fromEntries(
      [...m.QUALITY, ...m.DELTA].map((k) => [
        k,
        { score: 4, reason: "Verified finding", evidence_ids: ["ir"] },
      ]),
    ),
    narrative_momentum: 80,
    market_confirmation: 60,
    confidence: 0.8,
    thesis: "Test",
    risks: ["Test risk"],
    drivers: [{ label: "Test driver", impact: 1, evidence_ids: ["ir"] }],
    evidence: [
      {
        id: "ir",
        headline: "Release",
        summary: "Facts",
        source: "Company IR",
        source_type: "primary",
        url: "https://example.com/ir",
        published_at: "2026-09-11T00:00:00Z",
        novelty: 0.8,
        materiality: 0.8,
        confidence: 0.9,
        sentiment: "positive",
      },
      {
        id: "news",
        headline: "News",
        summary: "Facts",
        source: "News",
        source_type: "news",
        url: "https://example.com/news",
        published_at: "2026-09-11T00:00:00Z",
        novelty: 0.8,
        materiality: 0.8,
        confidence: 0.9,
        sentiment: "neutral",
      },
    ],
  };
}
const cutoff = new Date("2026-09-12T00:00:00Z");
test("Saturday KST 09:00 boundary is exact across US DST", () => {
  assert.equal(m.weekDate(new Date("2026-09-11T23:59:59Z")), "2026-09-05");
  assert.equal(m.weekDate(cutoff), "2026-09-12");
  assert.equal(m.weekDate(new Date("2026-03-14T00:00:00Z")), "2026-03-14");
  assert.equal(m.nextUpdate(cutoff), "2026-09-19T00:00:00.000Z");
});
test("weighted formula uses normalized 40-point components", () => {
  const a = assessment();
  assert.equal(m.scores(a).quality_score, 32);
  assert.equal(m.scores(a).delta_score, 32);
  assert.equal(m.scores(a).super_score, 78);
  assert.equal(m.scores(a).classification, "Super Stock");
});
test("ticker normalization accepts share classes and rejects instructions", () => {
  assert.equal(m.normalizeTicker(" brk.b "), "BRK.B");
  assert.equal(m.normalizeTicker("nvda"), "NVDA");
  for (const t of ["", null, "NVDA;DROP", "<script>", "../../key", "ABC DEF"])
    assert.throws(() => m.normalizeTicker(t));
});
test("reject future evidence and out-of-range scores", () => {
  const a = assessment();
  a.evidence[0].published_at = "2026-09-12T00:00:01Z";
  assert.throws(() => m.validateAssessment(a, cutoff));
  a.evidence[0].published_at = "2026-09-11T00:00:00Z";
  a.components.tam.score = 6;
  assert.throws(() => m.validateAssessment(a, cutoff));
});
test("reject unsourced components, duplicate IDs and non-HTTPS links", () => {
  for (const edit of [
    (a) => (a.components.tam.evidence_ids = ["invented"]),
    (a) => (a.evidence[1].id = "ir"),
    (a) => (a.evidence[0].url = "javascript:alert(1)"),
  ]) {
    const a = assessment();
    edit(a);
    assert.throws(() => m.validateAssessment(a, cutoff));
  }
});
test("reject high scores based solely on social chatter", () => {
  const a = assessment();
  a.evidence[1].source_type = "social";
  a.components.tam.evidence_ids = ["news"];
  assert.throws(() => m.validateAssessment(a, cutoff));
});
test("valid sourced assessment passes without mutation", () => {
  const a = assessment();
  assert.equal(m.validateAssessment(a, cutoff), a);
});
function snap(ticker, week_date, super_score) {
  return {
    ...assessment(),
    ...m.scores(assessment()),
    ticker,
    week_date,
    super_score,
    created_at: week_date + "T00:00:00Z",
  };
}
test("4W delta requires exact 4-week snapshot and does not substitute oldest", () => {
  let rows = [
    snap("BE", "2026-09-12", 80),
    snap("BE", "2026-09-05", 75),
    snap("BE", "2026-08-22", 60),
  ];
  assert.equal(m.rankSnapshots(rows, "2026-09-12", ["BE"])[0].fourWeek, null);
  rows.push(snap("BE", "2026-08-15", 65));
  const r = m.rankSnapshots(rows, "2026-09-12", ["BE"])[0];
  assert.equal(r.wow, 5);
  assert.equal(r.fourWeek, 15);
});
test("rank changes direction correctly and ties are deterministic", () => {
  const rows = [
    snap("NVDA", "2026-09-12", 80),
    snap("BE", "2026-09-12", 80),
    snap("NVDA", "2026-09-05", 90),
    snap("BE", "2026-09-05", 70),
  ];
  const result = m.rankSnapshots(rows, "2026-09-12", ["BE", "NVDA"]);
  assert.equal(result[0].ticker, "BE");
  assert.equal(result[0].rankChange, 1);
  assert.equal(result[1].rankChange, -1);
  assert.equal(m.rankSnapshots(rows, "2026-09-12", ["NVDA"]).length, 1);
});
test("private endpoints reject anonymous access before database writes", async () => {
  let called = false;
  const api = load("app/api/super-stock/route.ts", {
    "@/data/super-stock/research-prices-20260916.json": {},
    "next/server": {
      NextResponse: {
        json: (data, opts) => ({ data, status: opts?.status ?? 200 }),
      },
    },
    "@/lib/supabaseAdmin": {
      createSupabaseAdminClient: () => {
        called = true;
        throw Error("Unexpected DB access");
      },
    },
    "@/lib/super-stock/model": m,
    "@/lib/super-stock/server": { userFromRequest: async () => null },
  });
  assert.equal((await api.GET({})).status, 401);
  assert.equal((await api.POST({})).status, 401);
  assert.equal(called, false);
});
test('OpenAI pipeline performs research, analyst and judge with source validation',async()=>{
 const requests=[];const a=assessment();
 const engine=load('lib/super-stock/engine.ts',{'./model':m},{process:{env:{OPENAI_API_KEY:'test-key',SUPER_STOCK_MODEL:'test-model'}},fetch:async(url,options)=>{
  requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({status:'completed',output:requests.length===1?[{type:'web_search_call',action:{sources:a.evidence.map(e=>({url:e.url}))}},{type:'message',content:[{type:'output_text',text:'Sourced facts'}]}]:[{type:'message',content:[{type:'output_text',text:JSON.stringify(a)}]}]})};
 }});
 const result=await engine.assess('BE',cutoff,null);assert.equal(result.components.tam.score,4);assert.equal(requests.length,3);assert.equal(requests[0].tools[0].type,'web_search');assert.equal(requests[1].text.format.strict,true);assert.equal(requests[2].store,false);
});
test('OpenAI refusal and missing API key fail closed',async()=>{
 for(const env of [{},{OPENAI_API_KEY:'test-key'}]){
 const engine=load('lib/super-stock/engine.ts',{'./model':m},{process:{env},fetch:async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'refusal',refusal:'No analysis'}]}]})})});
 await assert.rejects(()=>engine.assess('BE',cutoff,null));
 }
});
