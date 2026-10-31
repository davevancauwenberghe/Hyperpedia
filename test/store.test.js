const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('admin passwords are hashed and verifiable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');
  store.saveAdmin('beheerder', 'een-veilig-wachtwoord');
  const saved = store.getAdmin();
  assert.equal(saved.username, 'beheerder');
  assert.notEqual(saved.hash, 'een-veilig-wachtwoord');
  assert.equal(store.verifyPassword('een-veilig-wachtwoord', saved), true);
  assert.equal(store.verifyPassword('verkeerd', saved), false);
});

test('legacy embedded read counts are migrated into durable read metrics', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');
  fs.writeFileSync(
    path.join(dir, 'hyperpedia-posts.json'),
    JSON.stringify({
      posts: [{ id: 'post-1', author: 'Auteur', title: 'Titel', body: 'Tekst', read_count: 42 }],
    }),
  );

  assert.equal(store.getStats().readCount, 42);
  store.recordPostRead('post-1');
  assert.equal(store.getStats().readCount, 43);
  store.flushReadMetrics();
  const metrics = JSON.parse(
    fs.readFileSync(path.join(dir, 'hyperpedia-read-metrics.json'), 'utf8'),
  );
  assert.equal(metrics.posts['post-1'].read_count, 43);
  assert.equal(store.allPosts()[0].read_count, undefined);
});

test('editing a legacy post preserves embedded read counts before stripping old fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');
  fs.writeFileSync(
    path.join(dir, 'hyper-posts.json'),
    JSON.stringify({ posts: [{ id: 'one', title: 'Old', body: 'Text', read_count: 42 }] }),
  );
  const posts = store.postsForEdit();
  posts[0].title = 'Edited';
  store.savePosts(posts);
  assert.equal(store.allPosts()[0].title, 'Edited');
  assert.equal(store.getStats().readCount, 42);
});

test('corrupt archive fails closed instead of silently overwriting stories', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');
  const file = path.join(dir, 'hyperpedia-posts.json');
  fs.writeFileSync(file, '{broken');
  assert.throws(() => store.allPosts());
  assert.throws(() => store.savePosts([]));
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('cached archive snapshots cannot mutate durable data and external replacements invalidate the cache', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');
  store.savePosts([{ id: 'one', title: 'Original', body: 'Text' }]);
  const snapshot = store.allPosts();
  snapshot[0].title = 'Not saved';
  assert.equal(store.allPosts()[0].title, 'Original');
  fs.writeFileSync(
    path.join(dir, 'hyperpedia-posts.json'),
    JSON.stringify({ posts: [{ id: 'one', title: 'Replaced on disk', body: 'Text' }] }),
  );
  assert.equal(store.allPosts()[0].title, 'Replaced on disk');
  assert.throws(() => store.savePosts([{ id: 'one', labels: {} }]));
  assert.equal(store.allPosts()[0].title, 'Replaced on disk');
});

test('async password checks retain compatibility and malformed credentials fail safely', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');
  store.saveAdmin('admin', 'safe-password');
  const admin = store.getAdmin();
  assert.equal(await store.verifyPasswordAsync('safe-password', admin), true);
  assert.equal(await store.verifyPasswordAsync('wrong', admin), false);
  assert.equal(await store.verifyPasswordAsync('safe-password', { ...admin, hash: '00' }), false);
  assert.equal(store.verifyPassword('safe-password', { ...admin, iterations: -1 }), false);
});
