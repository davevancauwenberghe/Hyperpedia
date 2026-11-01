const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function worker(fetcher) {
  const handlers = {};
  const writes = [];
  const deletions = [];
  const cache = {
    match: async () => new Response('<h1>Offline</h1>'),
    put: async (key) => writes.push(key),
  };
  const context = vm.createContext({
    URL,
    Request,
    Response,
    fetch: fetcher,
    caches: {
      open: async () => cache,
      keys: async () => ['hyperpedia-shell-old', 'hyperpedia-shell-0.6.1', 'another-app'],
      delete: async (key) => deletions.push(key),
    },
    self: {
      location: new URL('https://hyperpedia.app/sw.js?v=0.6.1'),
      clients: { claim: async () => {} },
      addEventListener: (name, callback) => {
        handlers[name] = callback;
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), context);
  const request = (pathname, options = {}) => {
    let response;
    handlers.fetch({
      request: {
        url: 'https://hyperpedia.app' + pathname,
        method: 'GET',
        mode: 'navigate',
        ...options,
      },
      respondWith: (promise) => {
        response = promise;
      },
    });
    return response;
  };
  return { handlers, request, writes, deletions };
}

test('app worker bypasses administration, POST requests and cross-origin resources', () => {
  const w = worker(() => {
    throw new Error('Should not fetch');
  });
  for (const url of ['/admin', '/admin/export', '/login', '/logout'])
    assert.equal(w.request(url), undefined);
  assert.equal(w.request('/posts/story/read', { method: 'POST' }), undefined);
  assert.equal(w.request('/', { url: 'https://another.example/' }), undefined);
});

test('visited story HTML, including authenticated layouts, is never written to app storage', async () => {
  const w = worker(
    async () =>
      new Response('<nav>Private admin controls</nav>', {
        headers: { 'Cache-Control': 'private, no-store' },
      }),
  );
  assert.match(await (await w.request('/posts/story')).text(), /Private admin controls/);
  assert.deepEqual(w.writes, []);
});

test('offline fallback is non-indexable and temporary; updates delete only old app shells', async () => {
  const w = worker(async () => {
    throw new Error('Offline');
  });
  const response = await w.request('/posts/story');
  assert.equal(response.status, 503);
  assert.match(response.headers.get('x-robots-tag'), /noindex/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  let activate;
  w.handlers.activate({
    waitUntil: (promise) => {
      activate = promise;
    },
  });
  await activate;
  assert.deepEqual(w.deletions, ['hyperpedia-shell-old']);
});

test('static shell requests omit cookies and honor private or non-storable responses', async () => {
  let forwarded;
  const w = worker(async (request) => {
    forwarded = request;
    return new Response('CSS', {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  });
  let response;
  w.handlers.fetch({
    request: new Request('https://hyperpedia.app/style.css?v=0.6.1', {
      credentials: 'include',
    }),
    respondWith: (promise) => {
      response = promise;
    },
  });
  await response;
  assert.equal(forwarded.credentials, 'omit');
  assert.deepEqual(w.writes, []);
});
