const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
  readForm,
  createLoginBodyReader,
  LOGIN_BODY_LIMITS,
} = require('../src/forms');

function request(headers = {}) {
  const stream = new PassThrough();
  stream.headers = headers;
  return stream;
}

test('form byte limits cover declared and chunked bodies and clear collection listeners', async () => {
  const oversized = request({ 'content-length': '9' });
  await assert.rejects(readForm(oversized, { maxBytes: 8 }), {
    status: 413,
    closeConnection: true,
  });
  assert.equal(oversized.listenerCount('data'), 0);
  const chunked = request();
  const failure = assert.rejects(readForm(chunked, { maxBytes: 8 }), {
    status: 413,
    closeConnection: true,
  });
  chunked.write('a=123');
  chunked.write('4567');
  await failure;
  assert.equal(chunked.listenerCount('data'), 0);
  assert.equal(chunked.listenerCount('end'), 0);
  const exact = request();
  const form = readForm(exact, { maxBytes: 8 });
  exact.end('a=123456');
  assert.deepEqual(await form, { a: '123456' });
});

test('login upload admission is separate, bounded, and released on completion or abort', async () => {
  const read = createLoginBodyReader({
    ...LOGIN_BODY_LIMITS,
    maxConcurrent: 2,
    timeoutMs: 1000,
  });
  const first = request();
  const second = request();
  const pendingFirst = read(first, 'first');
  const aborted = assert.rejects(read(second, 'second'), { status: 400 });
  await assert.rejects(read(request(), 'first'), {
    status: 429,
    closeConnection: true,
  });
  await assert.rejects(read(request(), 'third'), {
    status: 429,
    closeConnection: true,
  });
  first.end('username=admin');
  assert.deepEqual(await pendingFirst, { username: 'admin' });
  const reused = request();
  const complete = read(reused, 'first');
  reused.end('password=example');
  assert.deepEqual(await complete, { password: 'example' });
  second.emit('aborted');
  await aborted;
  const afterAbort = request();
  const retry = read(afterAbort, 'second');
  afterAbort.end('a=ok');
  assert.deepEqual(await retry, { a: 'ok' });
});

test('login upload deadline is absolute even while data trickles in and frees admission', async () => {
  const read = createLoginBodyReader({
    ...LOGIN_BODY_LIMITS,
    maxConcurrent: 1,
    timeoutMs: 60,
  });
  const slow = request();
  const timeout = assert.rejects(read(slow, 'slow'), {
    status: 408,
    closeConnection: true,
  });
  const trickle = setInterval(() => slow.write('x'), 10);
  try {
    await timeout;
  } finally {
    clearInterval(trickle);
  }
  assert.equal(slow.listenerCount('data'), 0);
  const retry = request();
  const complete = read(retry, 'slow');
  retry.end('a=ok');
  assert.deepEqual(await complete, { a: 'ok' });
});
