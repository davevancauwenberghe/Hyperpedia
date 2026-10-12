const test = require('node:test');
const assert = require('node:assert/strict');
const { searchPosts, dateKey, storiesOfTheDay } = require('../src/archive');

test('search matches accents, separate words and reply content', () => {
  const posts = [
    {
      id: 'a',
      title: 'Een déjà vu',
      body: 'Rustiger ademen',
      labels: [],
      replies: [{ body: 'Er was ook spanning' }],
    },
    {
      id: 'b',
      title: 'Ander verhaal',
      body: 'Ademen',
      labels: [],
      replies: [],
    },
  ];
  assert.deepEqual(
    searchPosts(posts, 'DEJA  spanning ademen').map((post) => post.id),
    ['a'],
  );
  assert.deepEqual(searchPosts(posts, 'vu slaap'), []);
});

test('daily selection uses Brussels midnight rather than the server timezone', () => {
  assert.equal(dateKey(new Date('2026-10-11T22:05:00Z')), '2026-10-12');
  assert.equal(dateKey(new Date('2026-12-11T23:05:00Z')), '2026-12-12');
  const posts = Array.from({ length: 9 }, (_, i) => ({ id: String(i) }));
  assert.deepEqual(
    storiesOfTheDay(posts, new Date('2026-10-11T22:05:00Z')),
    storiesOfTheDay(posts, new Date('2026-10-12T09:00:00Z')),
  );
});
