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
