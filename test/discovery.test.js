const test = require('node:test');
const assert = require('node:assert/strict');
const { robotsText, llmsText } = require('../src/discovery');

test('crawler rules allow the public archive for any search or AI user agent', () => {
  const robots = robotsText('https://hyperpedia.app');
  assert.match(robots, /User-agent: \*\nAllow: \//);
  assert.doesNotMatch(robots, /Disallow|Crawl-delay/);
  assert.match(robots, /Sitemap: https:\/\/hyperpedia.app\/sitemap.xml/);
});

test('AI guide uses bounded live themes and routes, canonical links and archive context', () => {
  const posts = Array.from({ length: 20 }, (_, i) => ({
    labels: [`Thema ${i}`, 'stress', 'stress'],
  }));
  const routes = Array.from({ length: 10 }, (_, i) => ({
    id: `route-${i}`,
    title: `Route ${i}`,
  }));
  const guide = llmsText(posts, routes, 'https://hyperpedia.app');
  assert.ok(guide.startsWith('# Hyperpedia\n\n> '));
  assert.match(guide, /geen medisch advies/);
  assert.match(guide, /geen accounts of geverifieerde biografieën/);
  assert.equal((guide.match(/\?label=/g) || []).length, 12);
  assert.equal((guide.match(/\/leesroutes\/route-/g) || []).length, 6);
  assert.ok(guide.indexOf('[stress]') < guide.indexOf('[Thema'));
  assert.doesNotMatch(guide, /\/admin|\/login|hyperpedia-reading-v2|localhost/);
  assert.match(guide, /https:\/\/hyperpedia.app\/sitemap.xml/);
});

test('AI guide safely formats unusual theme text and an empty archive', () => {
  const guide = llmsText(
    [{ labels: ['[onrust]\n<test>(nacht)'] }],
    [],
    'https://example.org',
  );
  assert.match(guide, /\\\[onrust\\\] \\<test\\>/);
  assert.match(guide, /%5Bonrust%5D%0A%3Ctest%3E%28nacht%29/);
  const empty = llmsText([], [], 'https://example.org');
  assert.doesNotMatch(empty, /## Thema’s|## Leesroutes/);
  assert.match(empty, /https:\/\/example.org\/leesroutes/);
});
