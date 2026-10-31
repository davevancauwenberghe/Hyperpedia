const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function start(t, script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-shutdown-'));
  fs.writeFileSync(
    path.join(dir, 'hyperpedia-posts.json'),
    JSON.stringify({ posts: [{ id: 'one', title: 'Verhaal' }] }),
  );
  const child = spawn(process.execPath, script ? ['-e', script] : ['src/server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      DATA_DIR: dir,
      PORT: '0',
      HOST: '127.0.0.1',
      SESSION_SECRET: 'shutdown-test-'.repeat(4),
      SITE_URL: '',
      REQUIRE_EXISTING_DATA: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const exited = new Promise((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal })),
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Child did not listen: ' + stderr)), 5000);
    child.stdout.on('data', () => {
      const match = stdout.match(/listening on 127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('Child exited before listening: ' + stderr));
    });
  });
  if (script) ready.catch(() => {});
  return { child, dir, ready, exited, stderr: () => stderr };
}
test(
  'SIGTERM drains the HTTP server and durably flushes pending read totals',
  { timeout: 10000 },
  async (t) => {
    const child = start(t);
    const base = await child.ready;
    const response = await fetch(base + '/posts/one/read', {
      method: 'POST',
      headers: { origin: base, 'x-hyperpedia-consent': 'statistics' },
    });
    assert.equal(response.status, 200);
    await response.text();
    const metrics = path.join(child.dir, 'hyperpedia-read-metrics.json');
    assert.equal(fs.existsSync(metrics), false);
    child.child.kill('SIGTERM');
    assert.deepEqual(await child.exited, { code: 0, signal: null });
    assert.equal(JSON.parse(fs.readFileSync(metrics)).posts.one.read_count, 1);
  },
);
test(
  'unhandled rejections are logged and exit through the same durable shutdown path',
  { timeout: 10000 },
  async (t) => {
    const child = start(
      t,
      `
    const store = require('./src/store');
    const { server } = require('./src/server');
    require('./src/lifecycle').installLifecycle(server, store);
    server.listen(0, '127.0.0.1', () => {
      store.recordPostRead('one');
      Promise.reject(new Error('Synthetic rejection'));
    });
  `,
    );
    assert.equal((await child.exited).code, 1);
    assert.match(child.stderr(), /Unhandled promise rejection: Error: Synthetic rejection/);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(child.dir, 'hyperpedia-read-metrics.json'))).posts.one
        .read_count,
      1,
    );
  },
);
