const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('administrator setup accepts bounded stdin and rejects short or argv passwords without exposing them', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-admin-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const run = (args, input) =>
    spawnSync(process.execPath, ['scripts/create-admin.js', ...args], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATA_DIR: dir, REQUIRE_EXISTING_DATA: 'false' },
      input,
      encoding: 'utf8',
    });
  const password = 'sixteen-characters-minimum';
  const rejected = run(['admin', password]);
  assert.equal(rejected.status, 1);
  assert.ok(!rejected.stderr.includes(password));
  assert.equal(fs.existsSync(path.join(dir, 'hyperpedia-admin.json')), false);
  assert.equal(run(['admin', '--password-stdin'], 'short-password\n').status, 1);
  assert.equal(run(['admin', '--password-stdin'], 'x'.repeat(8193)).status, 1);
  const saved = run(['admin', '--password-stdin'], password + '\n');
  assert.equal(saved.status, 0, saved.stderr);
  assert.ok(!saved.stdout.includes(password) && !saved.stderr.includes(password));
  const before = fs.readFileSync(path.join(dir, 'hyperpedia-admin.json'));
  assert.equal(JSON.parse(before).iterations, 600000);
  assert.equal(run(['admin', '--password-stdin'], 'invalid\nmultiline-password').status, 1);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'hyperpedia-admin.json')), before);
});
