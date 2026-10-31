const PAGE_SIZES = [6, 12, 18, 24, 30, 36];
function pageSize(value) {
  const size = Number(value);
  return PAGE_SIZES.includes(size) ? size : 18;
}

function normalizeSearch(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('nl')
    .replace(/\s+/g, ' ')
    .trim();
}
const indexes = new WeakMap();
function archiveIndex(posts) {
  let cached = indexes.get(posts);
  if (cached) return cached;
  const ordered = Object.freeze(
    [...posts].sort(
      (a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), 'nl') ||
        a.id.localeCompare(b.id),
    ),
  );
  cached = {
    ordered,
    daily: Object.freeze([...posts].sort((a, b) => a.id.localeCompare(b.id, 'nl'))),
    labels: Object.freeze(
      [...new Set(posts.flatMap((post) => post.labels || []))].sort((a, b) =>
        a.localeCompare(b, 'nl'),
      ),
    ),
    rows: null,
  };
  indexes.set(posts, cached);
  return cached;
}
function searchPosts(posts, query) {
  const normalized = normalizeSearch(query).slice(0, 300);
  const terms = [...new Set(normalized.split(' ').filter(Boolean))];
  const index = archiveIndex(posts);
  if (!terms.length) return index.ordered;
  // Build once per immutable file snapshot, not once per request or search term.
  index.rows ||= index.ordered.map((post) => ({
    post,
    title: normalizeSearch(post.title),
    labels: normalizeSearch((post.labels || []).join(' ')),
    author: normalizeSearch(post.author),
    text: Buffer.from(
      normalizeSearch(
        `${post.body || ''} ${(post.replies || []).map((reply) => `${reply.originalReplier || ''} ${reply.author || ''} ${reply.body || ''}`).join(' ')}`,
      ),
    ),
  }));
  const needles = terms.map((term) => Buffer.from(term));
  const matches = [];
  for (const row of index.rows) {
    let score = row.title.includes(normalized) ? 100 : 0;
    let matchesAll = true;
    for (let index = 0; index < terms.length; index++) {
      const term = terms[index];
      const title = row.title.includes(term);
      const label = row.labels.includes(term);
      const author = row.author.includes(term);
      const body = row.text.includes(needles[index]);
      if (!title && !label && !author && !body) {
        matchesAll = false;
        break;
      }
      score += (title ? 12 : 0) + (label ? 8 : 0) + (author ? 3 : 0) + (body ? 1 : 0);
    }
    if (matchesAll) matches.push({ post: row.post, score });
  }
  return matches.sort((a, b) => b.score - a.score).map((match) => match.post);
}

function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
function storiesOfTheDay(posts, date = new Date(), count = 4) {
  if (posts.length <= count) return posts;
  const ordered = archiveIndex(posts).daily;
  const start =
    (Math.floor(Date.parse(`${dateKey(date)}T00:00:00Z`) / 86400000) * count) % ordered.length;
  return Array.from({ length: count }, (_, index) => ordered[(start + index) % ordered.length]);
}
module.exports = { searchPosts, storiesOfTheDay, dateKey, pageSize, archiveIndex };
