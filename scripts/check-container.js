// Run only against the disposable fixture created by the container CI workflow.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const compose = (...args) => execFileSync('docker', ['compose', ...args], { encoding: 'utf8' }).trim();
const base = 'http://127.0.0.1:18081';
async function healthy() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(base + '/healthz', { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Container did not become healthy');
}
async function check() {
  const headers = { 'x-forwarded-host': 'hyperpedia.app', 'x-forwarded-proto': 'https' };
  // Never follow the production canonical URL from this disposable local test.
  const story = await fetch(base + '/posts/migration-story', { headers, redirect: 'manual' });
  assert.equal(story.status, 200);
  assert.match(await story.text(), /Original text/);
  const login = await fetch(base + '/login', {
    method: 'POST', headers, redirect: 'manual',
    body: new URLSearchParams({username:'migration-admin',password:'original-migration-password'}),
  });
  assert.equal(login.status, 302);
  const summary = JSON.parse(compose('exec', '-T', 'hyperpedia', 'node', 'scripts/check-data.js'));
  assert.deepEqual(summary, {stories:1,replies:1,curatedRoutes:0,administrator:'configured'});
  const jsonFiles = compose('exec', '-T', 'hyperpedia', 'node', '-e', `
    const fs = require('node:fs');
    const crypto = require('node:crypto');
    console.log(JSON.stringify(fs.readdirSync('/data').filter(n => n.endsWith('.json')).sort().map(n => [n, crypto.createHash('sha256').update(fs.readFileSync('/data/' + n)).digest('hex')])));
  `);
  return jsonFiles;
}
(async () => {
  await healthy();
  assert.equal(compose('port', 'hyperpedia', '8080'), '127.0.0.1:18081');
  assert.equal(compose('exec', '-T', 'hyperpedia', 'id', '-u'), '1000');
  const before = await check();
  compose('restart', 'hyperpedia');
  await healthy();
  assert.equal(await check(), before, 'Restart must preserve every data file byte-for-byte');
  console.log('Container startup, private binding, original admin login and persistent data: passed');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
