const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const zlib = require('node:zlib');
const { assetUrl, createAssetService } = require('../src/assets');
const { createReadTracking } = require('../src/read-tracking');

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-security-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'security-test-'.repeat(4);
  delete process.env.SITE_URL;
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts([{ id: 'one', title: 'Titel', body: '</script><script>bad()</script>' }]);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { base };
}
test('CSP allows only self-hosted scripts and exact JSON-LD hashes on normal, error and health responses', async (t) => {
  const { base } = await fixture(t);
  for (const route of ['/', '/posts/one', '/login', '/missing', '/healthz']) {
    const response = await fetch(base + route);
    const policy = response.headers.get('content-security-policy');
    assert.match(policy, /default-src 'self'/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
    assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
    assert.equal(response.headers.get('x-hyperpedia-version'), null);
    const html = await response.text();
    for (const match of html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )) {
      const hash = crypto.createHash('sha256').update(match[1]).digest('base64');
      assert.ok(policy.includes(`'sha256-${hash}'`));
    }
  }
  const previous = process.env.CSP_REPORT_ONLY;
  try {
    process.env.CSP_REPORT_ONLY = 'true';
    const response = await fetch(base);
    assert.equal(response.headers.get('content-security-policy'), null);
    assert.match(response.headers.get('content-security-policy-report-only'), /script-src 'self'/);
  } finally {
    if (previous === undefined) delete process.env.CSP_REPORT_ONLY;
    else process.env.CSP_REPORT_ONLY = previous;
  }
});
function raw(url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { headers, method }, (response) => {
      const parts = [];
      response.on('data', (part) => parts.push(part));
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(parts),
        }),
      );
    });
    request.on('error', reject);
    request.end();
  });
}
test('versioned assets negotiate compression, use representation ETags, and keep worker updates revalidatable', async (t) => {
  const { base } = await fixture(t);
  const source = fs.readFileSync(path.join(__dirname, '../public/archive.js'));
  const gzip = await raw(base + assetUrl('archive.js'), { 'accept-encoding': 'gzip' });
  assert.equal(gzip.status, 200);
  assert.equal(gzip.headers['content-encoding'], 'gzip');
  assert.deepEqual(zlib.gunzipSync(gzip.body), source);
  assert.match(gzip.headers['cache-control'], /max-age=31536000, immutable/);
  assert.equal(gzip.headers.vary, 'Accept-Encoding');
  const br = await raw(base + assetUrl('archive.js'), {
    'accept-encoding': 'gzip;q=0, br;q=1',
  });
  assert.equal(br.headers['content-encoding'], 'br');
  assert.deepEqual(zlib.brotliDecompressSync(br.body), source);
  assert.notEqual(br.headers.etag, gzip.headers.etag);
  const cached = await raw(base + assetUrl('archive.js'), {
    'accept-encoding': 'gzip',
    'if-none-match': 'W/' + gzip.headers.etag,
  });
  assert.equal(cached.status, 304);
  assert.equal(cached.body.length, 0);
  const head = await raw(base + assetUrl('archive.js'), { 'accept-encoding': 'gzip' }, 'HEAD');
  assert.equal(head.body.length, 0);
  assert.equal(Number(head.headers['content-length']), gzip.body.length);
  const plain = await raw(base + '/archive.js?v=old', { 'accept-encoding': 'gzip;q=0, br;q=0' });
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.deepEqual(plain.body, source);
  assert.doesNotMatch(plain.headers['cache-control'], /immutable/);
  const worker = await raw(base + assetUrl('sw.js'));
  assert.equal(worker.headers['cache-control'], 'no-cache');
  assert.equal(worker.headers['service-worker-allowed'], '/');
});
test('read-abuse memory has bounded admission and expired entries can be reused', () => {
  let time = 1_000_000;
  let writes = 0;
  const track = createReadTracking({
    store: { getPost: () => ({}), recordPostRead: () => writes++ },
    clientKey: (req) => req.client,
    getSiteUrl: () => 'https://hyperpedia.app/',
    send: (res, _body, code) => {
      res.status = code;
    },
    now: () => time,
  });
  const request = (client, story = 'one') => {
    const req = {
      client,
      method: 'POST',
      urlObj: new URL(`https://hyperpedia.app/posts/${story}/read`),
      headers: { origin: 'https://hyperpedia.app', 'x-hyperpedia-consent': 'statistics' },
    };
    const res = { setHeader() {} };
    track(req, res);
    return res.status;
  };
  for (let index = 0; index < 2048; index++) assert.equal(request(String(index)), 200);
  assert.equal(request('over-capacity'), 429);
  assert.equal(writes, 2048);
  time += 16 * 60_000;
  assert.equal(request('over-capacity'), 200);
  assert.equal(writes, 2049);
});

test('asset and installed-app URLs change with file contents without a release version bump', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-asset-change-'));
  fs.cpSync(path.join(__dirname, '../public'), dir, { recursive: true });
  const assets = createAssetService(dir);
  const server = http.createServer((req, res) => {
    req.urlObj = new URL(req.url, 'http://localhost');
    if (!assets.serveAsset(req, res)) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const cssUrl = assets.assetUrl('style.css');
  const workerUrl = assets.assetUrl('sw.js');
  const pwaUrl = assets.assetUrl('pwa.js');
  const original = await raw(base + cssUrl);
  assert.match(original.headers['cache-control'], /immutable/);
  const revised = Buffer.concat([original.body, Buffer.from('\n/* a CSS hotfix */\n')]);
  fs.writeFileSync(path.join(dir, 'style.css'), revised);
  const revisedUrl = assets.assetUrl('style.css');
  assert.notEqual(revisedUrl, cssUrl);
  assert.equal(
    new URL(revisedUrl, base).searchParams.get('v'),
    crypto.createHash('sha256').update(revised).digest('base64url'),
  );
  assert.notEqual(assets.assetUrl('sw.js'), workerUrl);
  assert.equal(assets.assetUrl('pwa.js'), pwaUrl);
  const stale = await raw(base + cssUrl, { 'if-none-match': original.headers.etag });
  assert.equal(stale.status, 200);
  assert.doesNotMatch(stale.headers['cache-control'], /immutable/);
  assert.deepEqual(stale.body, revised);
  const current = await raw(base + revisedUrl);
  assert.match(current.headers['cache-control'], /immutable/);
  assert.equal((await raw(base + assets.assetUrl('sw.js'))).headers['cache-control'], 'no-cache');
  assert.equal((await raw(base + '/constructor')).status, 404);
});
