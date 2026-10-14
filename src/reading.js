const crypto = require('node:crypto');

function replyKey(reply, index) {
  return reply.id
    ? `id-${reply.id}`
    : `legacy-${crypto
        .createHash('sha256')
        .update(
          JSON.stringify([
            index,
            reply.author,
            reply.originalReplier,
            reply.created_at,
            reply.body,
          ]),
        )
        .digest('hex')
        .slice(0, 24)}`;
}
function replyAnchor(key) {
  return `reply-${encodeURIComponent(key)}`;
}
function replyHref(post, key) {
  // The fragment must decode to the literal HTML id, including its percent signs.
  return `/posts/${encodeURIComponent(post.id)}#${encodeURIComponent(replyAnchor(key))}`;
}
function attributionPath(post, reply, index) {
  const base = `/bronvermelding/${encodeURIComponent(post.id)}`;
  return reply
    ? `${base}/reacties/${encodeURIComponent(replyKey(reply, index))}`
    : base;
}
function authorData(name, path, siteUrl) {
  const url = new URL(path, siteUrl).href;
  return { '@type': 'Person', '@id': `${url}#auteur`, name, url };
}
function themeId(label) {
  const slug =
    label
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'thema';
  return `${slug}-${crypto.createHash('sha256').update(label).digest('hex').slice(0, 8)}`;
}
function readingPaths(posts, definitions = []) {
  const labels = new Map();
  const ordered = [...posts].sort(
    (a, b) => a.title.localeCompare(b.title, 'nl') || a.id.localeCompare(b.id),
  );
  for (const post of ordered)
    for (const label of new Set(
      (post.labels || []).filter((label) => label.trim()),
    )) {
      if (!labels.has(label)) labels.set(label, []);
      labels.get(label).push(post.id);
    }
  const defaults = [...labels]
    .filter(([, ids]) => ids.length >= 3)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'nl'))
    .slice(0, 6)
    .map(([label, ids]) => ({
      id: themeId(label),
      title: label,
      description: `Een korte leesroute met ervaringen binnen het thema ${label}.`,
      postIds: ids.slice(0, 5),
      automatic: true,
    }));
  const routes = new Map(defaults.map((route) => [route.id, route]));
  for (const definition of definitions)
    routes.set(definition.id, { ...definition, automatic: false });
  const byId = new Map(posts.map((post) => [post.id, post]));
  return [...routes.values()]
    .map((route) => ({
      ...route,
      posts: route.postIds.map((id) => byId.get(id)).filter(Boolean),
    }))
    .filter((route) => route.posts.length);
}
function validatePathDefinitions(definitions) {
  const ids = new Set();
  if (!Array.isArray(definitions) || definitions.length > 30)
    throw new Error('Invalid reading paths.');
  for (const route of definitions) {
    if (
      !route ||
      typeof route.id !== 'string' ||
      !/^[a-z0-9-]{1,100}$/.test(route.id) ||
      ids.has(route.id) ||
      typeof route.title !== 'string' ||
      !route.title.trim() ||
      route.title.length > 100 ||
      typeof route.description !== 'string' ||
      route.description.length > 500 ||
      !Array.isArray(route.postIds) ||
      route.postIds.length < 3 ||
      route.postIds.length > 5 ||
      route.postIds.some((id) => typeof id !== 'string' || !id) ||
      new Set(route.postIds).size !== route.postIds.length
    )
      throw new Error('Invalid reading path.');
    ids.add(route.id);
  }
  return definitions;
}
module.exports = {
  replyKey,
  replyAnchor,
  replyHref,
  attributionPath,
  authorData,
  themeId,
  readingPaths,
  validatePathDefinitions,
};
