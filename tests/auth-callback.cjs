const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const moduleSource = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../app/auth/callback/route.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const callbackModule = { exports: {} };
vm.runInNewContext(`(function(require,module,exports){${moduleSource}\n})`, { URL })(
  () => ({ NextResponse: { redirect: url => url } }),
  callbackModule,
  callbackModule.exports,
);

test('OAuth callbacks stay on EAST for external and browser-normalized next paths', async () => {
  for (const next of ['https://example.org', '//example.org', '/\\example.org', '/\t/example.org', '/\n/example.org']) {
    const requestUrl = new URL('https://eastai.kr/auth/callback');
    requestUrl.searchParams.set('next', next);
    requestUrl.searchParams.set('code', 'test-only-code');
    const result = await callbackModule.exports.GET({ url: requestUrl.href });
    assert.equal(result.origin, 'https://eastai.kr', next);
    assert.equal(result.pathname, '/portfolio', next);
    assert.equal(result.searchParams.get('code'), 'test-only-code');
  }
});

test('OAuth callbacks retain valid local navigation and authentication errors', async () => {
  const requestUrl = new URL('https://eastai.kr/auth/callback');
  requestUrl.searchParams.set('next', '/memo?tab=weekly');
  requestUrl.searchParams.set('error', 'access_denied');
  const result = await callbackModule.exports.GET({ url: requestUrl.href });
  assert.equal(result.origin, 'https://eastai.kr');
  assert.equal(result.pathname, '/memo');
  assert.equal(result.searchParams.get('tab'), 'weekly');
  assert.equal(result.searchParams.get('error'), 'access_denied');
});
