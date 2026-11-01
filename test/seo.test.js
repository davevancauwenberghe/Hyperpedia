const test = require('node:test');
const assert = require('node:assert/strict');
const { sitemapDocuments } = require('../src/seo');

test('sitemap covers all posts, topic archives and pagination with genuine dates', () => {
  const posts = Array.from({ length: 37 }, (_, i) => ({
    id: `post-${i}`,
    labels: ['stress & ademhaling'],
    updated_at: i ? undefined : '2026-10-10T12:00:00Z',
  }));
  const { root } = sitemapDocuments(posts, 'https://hyperpedia.app/');
  assert.equal((root.match(/<url>/g) || []).length, 43);
  assert.match(root, /\?page=3<\/loc>/);
  assert.match(root, /\?label=stress\+%26\+ademhaling&amp;page=3/);
  assert.equal((root.match(/<lastmod>/g) || []).length, 1);
  assert.match(root, /2026-10-10T12:00:00.000Z/);
  assert.doesNotMatch(root, /1970|priority|changefreq/);
});

test('large archives split into discoverable sitemap documents without losing posts', () => {
  const posts = Array.from({ length: 10001 }, (_, i) => ({ id: `post-${i}`, labels: [] }));
  const { root, documents } = sitemapDocuments(posts, 'https://hyperpedia.app/');
  assert.match(root, /<sitemapindex/);
  assert.equal(documents.length, 3);
  for (let i = 0; i < documents.length; i++) {
    assert.ok(documents[i].match(/<url>/g).length <= 5000);
    assert.ok(root.includes(`https://hyperpedia.app/sitemaps/${i + 1}.xml`));
  }
  assert.equal((documents.join('').match(/<loc>[^<]*\/posts\//g) || []).length, 10001);
});
