const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { previewText } = require('../src/html');
const { searchPosts, archiveIndex, storiesOfTheDay } = require('../src/archive');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-review-store-'));
  process.env.DATA_DIR = dir;
  delete require.cache[require.resolve('../src/store')];
  const store = require('../src/store');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { store, dir, file: path.join(dir, 'hyperpedia-posts.json') };
}
test('archive snapshots are shared and deeply frozen; edits and file replacements invalidate search', (t) => {
  const { store, file } = fixture(t);
  store.savePosts([
    { id: 'one', title: 'Eerste titel', body: 'Kaakspanning', replies: [{ body: 'Ademhaling' }] },
  ]);
  const first = store.allPosts();
  assert.equal(store.allPosts(), first);
  assert.ok(
    Object.isFrozen(first) && Object.isFrozen(first[0]) && Object.isFrozen(first[0].replies[0]),
  );
  assert.equal(archiveIndex(first), archiveIndex(store.allPosts()));
  assert.equal(searchPosts(first, 'kaakspanning').length, 1);
  const edited = store.postsForEdit();
  edited[0].body = 'Duizeligheid';
  assert.equal(first[0].body, 'Kaakspanning');
  store.savePosts(edited);
  assert.notEqual(store.allPosts(), first);
  assert.equal(searchPosts(store.allPosts(), 'kaakspanning').length, 0);
  assert.equal(searchPosts(store.allPosts(), 'duizeligheid').length, 1);
  fs.writeFileSync(
    file,
    JSON.stringify({ posts: [{ id: 'two', title: 'Vervangen', body: 'Tintelingen' }] }),
  );
  assert.equal(store.getPost('one'), undefined);
  assert.equal(searchPosts(store.allPosts(), 'tintelingen')[0].id, 'two');
});
test('search ranks title and theme matches above body matches and indexes text only once', () => {
  let reads = 0;
  const posts = Object.freeze([
    {
      id: 'body',
      title: 'Achtergrond',
      get body() {
        reads++;
        return 'Ook tintelingen';
      },
    },
    { id: 'title', title: 'Tintelingen in mijn handen', body: 'Ervaring' },
    { id: 'label', title: 'Zenuwen', labels: ['tintelingen'], body: 'Ervaring' },
  ]);
  assert.deepEqual(
    searchPosts(posts, 'tintelingen').map((post) => post.id),
    ['title', 'label', 'body'],
  );
  for (let index = 0; index < 8; index++) searchPosts(posts, 'ervaring');
  assert.equal(reads, 1);
});
test('daily groups advance by a full group and cover the whole rotation', () => {
  const posts = Array.from({ length: 20 }, (_, index) => ({ id: String(index) }));
  let previous = [];
  const seen = new Set();
  for (let day = 1; day <= 5; day++) {
    const selection = storiesOfTheDay(posts, new Date(`2026-10-0${day}T12:00:00Z`));
    assert.equal(selection.length, 4);
    assert.ok(selection.every((post) => !previous.includes(post.id)));
    selection.forEach((post) => seen.add(post.id));
    previous = selection.map((post) => post.id);
  }
  assert.equal(seen.size, 20);
});
test('previews preserve surrogate pairs, combined emoji and combining accents', () => {
  assert.equal(previewText('a'.repeat(229) + '🫂tail', 230), 'a'.repeat(229) + '🫂…');
  assert.equal(previewText('a'.repeat(179) + '👩🏽‍💻tail', 180), 'a'.repeat(179) + '👩🏽‍💻…');
  assert.equal(previewText('e\u0301x', 1), 'e\u0301…');
  assert.equal(previewText('kort', 230), 'kort');
});
test('reply IDs are unique within each story, while id-less archived replies remain readable', (t) => {
  const { store, file } = fixture(t);
  store.savePosts([
    { id: 'one', replies: [{ id: 'a', body: 'Eerste' }, { body: 'Oude reactie' }] },
  ]);
  const before = fs.readFileSync(file);
  assert.throws(
    () => store.savePosts([{ id: 'one', replies: [{ id: 'same' }, { id: 'same' }] }]),
    /duplicate reply ID/,
  );
  assert.deepEqual(fs.readFileSync(file), before);
  store.savePosts([
    { id: 'one', replies: [{ id: 'a' }] },
    { id: 'two', replies: [{ id: 'a' }] },
  ]);
  fs.writeFileSync(
    file,
    JSON.stringify({ posts: [{ id: 'one', replies: [{ id: 'same' }, { id: 'same' }] }] }),
  );
  assert.throws(() => store.allPosts(), /duplicate reply ID/);
});
test('five private pre-edit backups rotate and preserve the original legacy bytes', (t) => {
  const { store, dir, file } = fixture(t);
  const original = '{"posts":[{"id":"one","title":"Version 0","body":"Original"}]}';
  fs.writeFileSync(path.join(dir, 'hyper-posts.json'), original);
  const edit = (title) => {
    const posts = store.postsForEdit();
    posts[0].title = title;
    store.savePosts(posts);
  };
  edit('Version 1');
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), original);
  for (let version = 2; version <= 6; version++) edit('Version ' + version);
  const backups = fs.readdirSync(dir).filter((name) => name.includes('.bak'));
  assert.equal(backups.length, 5);
  for (let index = 0; index < 5; index++) {
    const name = file + (index ? '.bak.' + index : '.bak');
    assert.equal(
      JSON.parse(fs.readFileSync(name, 'utf8')).posts[0].title,
      'Version ' + (5 - index),
    );
    assert.equal(fs.statSync(name).mode & 0o777, 0o600);
  }
  const backup = fs.readFileSync(file + '.bak');
  fs.writeFileSync(file, '{broken');
  assert.throws(() => store.savePosts([]));
  assert.deepEqual(fs.readFileSync(file + '.bak'), backup);
});
test('read increments avoid disk writes, flush once, and failed flushes retain pending counts', (t) => {
  const { store, dir } = fixture(t);
  store.savePosts([{ id: 'one', title: 'Verhaal' }]);
  const file = path.join(dir, 'hyperpedia-read-metrics.json');
  const original = fs.fsyncSync;
  let writes = 0;
  fs.fsyncSync = (...args) => {
    writes++;
    return original(...args);
  };
  try {
    for (let index = 0; index < 300; index++) store.recordPostRead('one');
    assert.equal(writes, 0);
    assert.equal(fs.existsSync(file), false);
    assert.equal(store.getStats().readCount, 300);
    store.flushReadMetrics();
    assert.equal(writes, 1);
    assert.equal(JSON.parse(fs.readFileSync(file)).posts.one.read_count, 300);
    store.recordPostRead('one');
    fs.writeFileSync(file, '{broken');
    assert.throws(() => store.flushReadMetrics());
    fs.writeFileSync(file, JSON.stringify({ posts: { one: { read_count: 300 } } }));
    store.flushReadMetrics();
    assert.equal(store.getStats().readCount, 301);
    store.purgePostRead('one');
    store.flushReadMetrics();
    assert.equal(store.getStats().readCount, 0);
  } finally {
    fs.fsyncSync = original;
  }
});
test('unknown usernames still derive a password and old hashes upgrade only on successful login', async (t) => {
  const { store, dir } = fixture(t);
  const salt = 'ab'.repeat(16);
  const password = 'old-password';
  const record = {
    username: 'admin',
    salt,
    iterations: 310000,
    hash: crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256').toString('hex'),
  };
  const legacy = path.join(dir, 'hyper-admin.json');
  fs.writeFileSync(legacy, JSON.stringify(record));
  const original = crypto.pbkdf2;
  const work = [];
  crypto.pbkdf2 = (...args) => {
    work.push(args[2]);
    return original(...args);
  };
  try {
    assert.equal(await store.checkAdminCredentials('unknown', 'wrong'), false);
    assert.equal(await store.checkAdminCredentials('admin', 'wrong'), false);
    assert.deepEqual(work, [310000, 310000]);
    assert.equal(fs.existsSync(path.join(dir, 'hyperpedia-admin.json')), false);
    assert.equal(await store.checkAdminCredentials('admin', password), true);
    assert.equal(store.getAdmin().iterations, 600000);
    assert.equal(store.verifyPassword(password, store.getAdmin()), true);
    assert.deepEqual(work.slice(2), [310000, 600000]);
  } finally {
    crypto.pbkdf2 = original;
  }
});
test('a password reset during verification cannot authenticate or overwrite the old account', async (t) => {
  const { store } = fixture(t);
  store.saveAdmin('admin', 'original-password');
  const checking = store.checkAdminCredentials('admin', 'original-password');
  store.saveAdmin('admin', 'replacement-password');
  assert.equal(await checking, false);
  assert.equal(store.verifyPassword('replacement-password', store.getAdmin()), true);
});
