const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../src/auth');
process.env.SESSION_SECRET = 'test'.repeat(12);

test('expired and replaced cookies cannot authenticate even if the client retains them', () => {
  const auth = createAuth();
  const request = { headers: {}, socket: {} };
  const cookie = auth.createSession(request).split(';')[0];
  request.headers.cookie = cookie;
  auth.authenticate(request);
  assert.equal(request.admin, true);
  const replacement = auth.createSession(request).split(';')[0];
  auth.authenticate(request);
  assert.equal(request.admin, false);
  request.headers.cookie = replacement;
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 8 * 24 * 3600 * 1000;
    auth.authenticate(request);
    assert.equal(request.admin, false);
  } finally {
    Date.now = originalNow;
  }
});

test('parallel login checks and forged forwarding headers cannot bypass the local limiter', () => {
  const auth = createAuth();
  const request = {
    headers: { 'x-forwarded-for': '192.0.2.1' },
    socket: { remoteAddress: '127.0.0.1' },
  };
  const key = auth.loginKey(request);
  assert.equal(key, '127.0.0.1');
  assert.equal(auth.beginLogin(key), 0);
  assert.equal(auth.beginLogin(key), 1);
  assert.equal(auth.endLogin(key, false), 0);
  request.headers['x-forwarded-for'] = '192.0.2.2';
  assert.equal(auth.loginKey(request), key);
  assert.equal(auth.beginLogin(key), 0);
  assert.equal(auth.endLogin(key, false), 60);
  assert.ok(auth.beginLogin(key) >= 59);
});

test('login cookies are session-only unless the administrator explicitly requests persistence', () => {
  const auth = createAuth();
  const request = { headers: {}, socket: {} };
  assert.doesNotMatch(auth.createSession(request), /Max-Age|Expires/);
  assert.match(auth.createSession(request, true), /Max-Age=604800/);
});

test('Apache client addresses require explicit trust and ignore arbitrary forwarding headers', () => {
  const previous = process.env.TRUST_APACHE_PROXY;
  const previousFly = process.env.FLY_APP_NAME;
  delete process.env.FLY_APP_NAME;
  try {
    const auth = createAuth();
    const request = {
      socket: { remoteAddress: '172.18.0.1' },
      headers: {
        'x-hyperpedia-client-ip': '192.0.2.10',
        'x-forwarded-for': '192.0.2.99',
        'cf-connecting-ip': '192.0.2.98',
      },
    };
    delete process.env.TRUST_APACHE_PROXY;
    assert.equal(auth.loginKey(request), '172.18.0.1');
    process.env.TRUST_APACHE_PROXY = 'true';
    assert.equal(auth.loginKey(request), '192.0.2.10');
    request.headers['x-hyperpedia-client-ip'] = '2001:db8::10';
    assert.equal(auth.loginKey(request), '2001:db8::10');
    for (const value of ['bad', '192.0.2.10, 192.0.2.11', ['192.0.2.10']]) {
      request.headers['x-hyperpedia-client-ip'] = value;
      assert.equal(auth.loginKey(request), '172.18.0.1');
    }
  } finally {
    if (previous === undefined) delete process.env.TRUST_APACHE_PROXY;
    else process.env.TRUST_APACHE_PROXY = previous;
    if (previousFly === undefined) delete process.env.FLY_APP_NAME;
    else process.env.FLY_APP_NAME = previousFly;
  }
});
