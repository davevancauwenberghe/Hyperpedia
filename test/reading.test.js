const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readingPaths,
  attributionPath,
  replyKey,
  validatePathDefinitions,
} = require('../src/reading');

test('theme routes are bounded, deterministic and can be overridden by an ordered selection', () => {
  const posts = Array.from({ length: 7 }, (_, i) => ({
    id: String(i),
    title: `Verhaal ${i}`,
    labels: ['ademhaling', 'onrust'],
  }));
  const routes = readingPaths(posts);
  assert.equal(routes.length, 2);
  assert.equal(routes[0].posts.length, 5);
  assert.deepEqual(readingPaths([...posts].reverse()), routes);
  const definitions = [
    {
      id: routes[0].id,
      title: 'Mijn route',
      description: 'Een selectie',
      postIds: ['5', '3', '1'],
    },
  ];
  validatePathDefinitions(definitions);
  const selected = readingPaths(posts, definitions).find(
    (route) => route.id === definitions[0].id,
  );
  assert.equal(selected.automatic, false);
  assert.deepEqual(
    selected.posts.map((post) => post.id),
    ['5', '3', '1'],
  );
  assert.deepEqual(
    readingPaths(
      posts.filter((post) => post.id !== '3'),
      definitions,
    )
      .find((route) => route.id === selected.id)
      .posts.map((post) => post.id),
    ['5', '1'],
  );
  assert.throws(() =>
    validatePathDefinitions([{ ...definitions[0], postIds: ['1', '1', '2'] }]),
  );
});

test('author attribution URLs distinguish contributions and safely handle legacy replies', () => {
  const first = { id: 'a/b' },
    second = { id: 'other' };
  assert.notEqual(attributionPath(first), attributionPath(second));
  assert.equal(attributionPath(first), '/bronvermelding/a%2Fb');
  const reply = { author: 'Dezelfde naam', body: 'Een reactie' };
  assert.notEqual(replyKey(reply, 0), replyKey(reply, 1));
  assert.notEqual(
    replyKey(reply, 0),
    replyKey({ ...reply, body: 'Gewijzigd' }, 0),
  );
  assert.match(
    attributionPath(first, { id: 'reply/id' }, 0),
    /reacties\/id-reply%2Fid$/,
  );
});
