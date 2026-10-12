const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function isoDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function archivePath(label = '', page = 1) {
  const params = new URLSearchParams();
  if (label) params.set('label', label);
  if (page > 1) params.set('page', String(page));
  return params.size ? `/?${params}` : '/';
}

// Build from the live store, so publishing and editing require no sitemap rebuild.
function sitemapDocuments(posts, siteUrl, perPage = 18, extraPaths = []) {
  const entries = new Map();
  const add = (loc, lastmod) => entries.set(loc, { loc, lastmod });
  const labels = new Map();
  const addArchive = (label, count) => {
    for (let page = 1; page <= Math.max(1, Math.ceil(count / perPage)); page++) {
      // Daily selections and pagination can change independently of post timestamps.
      add(archivePath(label, page));
    }
  };
  addArchive('', posts.length);
  for (const path of extraPaths) add(path);
  for (const post of posts) {
    add(`/posts/${encodeURIComponent(post.id)}`, isoDate(post.updated_at) || isoDate(post.created_at));
    for (const label of new Set(post.labels || [])) labels.set(label, (labels.get(label) || 0) + 1);
  }
  for (const [label, count] of [...labels].sort(([a], [b]) => a.localeCompare(b, 'nl'))) addArchive(label, count);
  const chunks = [[]];
  let bytes = 0;
  for (const { loc, lastmod } of entries.values()) {
    const entry = `<url><loc>${escapeXml(new URL(loc, siteUrl).href)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
    const size = Buffer.byteLength(entry);
    if (chunks.at(-1).length >= 5000 || bytes + size > 45 * 1024 * 1024) {
      chunks.push([]);
      bytes = 0;
    }
    chunks.at(-1).push(entry);
    bytes += size;
  }
  const xml = (tag, body) => `<?xml version="1.0" encoding="UTF-8"?>\n<${tag} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</${tag}>`;
  const documents = chunks.map(chunk => xml('urlset', chunk.join('\n')));
  return {
    root: documents.length === 1 ? documents[0] : xml('sitemapindex', documents.map((_, i) => `<sitemap><loc>${escapeXml(new URL(`/sitemaps/${i + 1}.xml`, siteUrl).href)}</loc></sitemap>`).join('\n')),
    documents,
  };
}

module.exports = { isoDate, sitemapDocuments };
