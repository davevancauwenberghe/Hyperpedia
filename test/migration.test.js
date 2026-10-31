const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(dir, args, required = false) {
  return spawnSync(process.execPath, args, {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dir, REQUIRE_EXISTING_DATA: String(required) },
    encoding: 'utf8',
    input: 'long-test-password\n',
  });
}

test('migration verification preserves a complete data copy, including the original admin hash', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-migrate-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  fs.mkdirSync(source);
  try {
    assert.equal(
      run(source, [
        '-e',
        `
      const s = require('./src/store');
      s.saveAdmin('original-admin', 'original-password');
      s.savePosts([{id:'one', title:'Original story', body:'Original text', replies:[{body:'Original reply'}]}]);
      s.recordPostRead('one');
      s.flushReadMetrics();
    `,
      ]).status,
      0,
    );
    const adminFile = path.join(source, 'hyperpedia-admin.json');
    const admin = fs.readFileSync(adminFile);
    // A real Fly volume may still use the legacy server-side filenames.
    fs.renameSync(adminFile, path.join(source, 'hyper-admin.json'));
    fs.renameSync(
      path.join(source, 'hyperpedia-posts.json'),
      path.join(source, 'hyper-posts.json'),
    );
    fs.cpSync(source, target, { recursive: true });
    const before = new Map(
      fs.readdirSync(target).map((name) => [name, fs.readFileSync(path.join(target, name))]),
    );
    const checked = run(target, ['scripts/check-data.js'], true);
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(JSON.parse(checked.stdout), {
      stories: 1,
      replies: 1,
      curatedRoutes: 0,
      administrator: 'configured',
    });
    const login = run(
      target,
      [
        '-e',
        `
      const s = require('./src/store');
      if (!s.verifyPassword('original-password', s.getAdmin())) process.exit(1);
    `,
      ],
      true,
    );
    assert.equal(login.status, 0, login.stderr);
    assert.deepEqual(fs.readFileSync(path.join(target, 'hyper-admin.json')), admin);
    assert.deepEqual(fs.readdirSync(target).sort(), [...before.keys()].sort());
    for (const [name, bytes] of before)
      assert.deepEqual(fs.readFileSync(path.join(target, name)), bytes);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migration startup rejects an empty, incomplete or corrupt data directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-migrate-bad-'));
  try {
    const start = () => run(dir, ['-e', "require('./src/server')"], true);
    assert.notEqual(start().status, 0);
    const file = path.join(dir, 'hyperpedia-posts.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ posts: [{ id: 'one', title: 'Story', body: 'Text' }] }),
    );
    assert.match(start().stderr, /No valid administrator record/);
    assert.equal(run(dir, ['scripts/create-admin.js', 'admin', '--password-stdin']).status, 0);
    fs.writeFileSync(file, '{broken');
    assert.notEqual(start().status, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
    fs.writeFileSync(
      file,
      JSON.stringify({ posts: [{ id: 'one', title: 'Story', body: 'Text' }] }),
    );
    fs.writeFileSync(path.join(dir, 'hyperpedia-reading-paths.json'), '{broken');
    assert.notEqual(start().status, 0);
    fs.unlinkSync(path.join(dir, 'hyperpedia-reading-paths.json'));
    fs.writeFileSync(path.join(dir, 'hyperpedia-read-metrics.json'), '{broken');
    assert.notEqual(start().status, 0);
    assert.notEqual(run(dir, ['scripts/check-data.js'], true).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
