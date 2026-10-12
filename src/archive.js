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
function searchPosts(posts, query) {
  const terms = normalizeSearch(query).split(' ').filter(Boolean);
  if (!terms.length) return posts;
  return posts.filter((post) => {
    const replies = (post.replies || [])
      .map(
        (reply) =>
          `${reply.originalReplier || ''} ${reply.author || ''} ${reply.body || ''}`,
      )
      .join(' ');
    const text = normalizeSearch(
      `${post.title} ${post.author} ${post.body} ${(post.labels || []).join(' ')} ${replies}`,
    );
    return terms.every((term) => text.includes(term));
  });
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
  const ordered = [...posts].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), 'nl'),
  );
  const start =
    Math.floor(Date.parse(`${dateKey(date)}T00:00:00Z`) / 86400000) %
    ordered.length;
  return Array.from(
    { length: count },
    (_, index) => ordered[(start + index) % ordered.length],
  );
}
module.exports = { searchPosts, storiesOfTheDay, dateKey, pageSize };
