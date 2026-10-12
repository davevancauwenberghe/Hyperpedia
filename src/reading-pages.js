const crypto = require('node:crypto');
const {
  allPosts,
  getPathDefinitions,
  savePathDefinitions,
} = require('./store');
const { readForm } = require('./forms');
const {
  readingPaths,
  themeId,
  replyKey,
  authorData,
  validatePathDefinitions,
} = require('./reading');
const { escapeHtml } = require('./html');
const ui = require('./reading-ui');
const revision = (definitions) =>
  crypto.createHash('sha256').update(JSON.stringify(definitions)).digest('hex');

function availablePaths(posts) {
  try {
    return readingPaths(posts, getPathDefinitions());
  } catch (error) {
    console.warn(
      'Reading path selections are unreadable; using theme routes:',
      error.message,
    );
    return readingPaths(posts);
  }
}

function createReadingPages({
  layout,
  send,
  redirect,
  requireAdmin,
  getSiteUrl,
  isAdmin,
}) {
  return async function handle(req, res, method) {
    const pathname = req.urlObj.pathname;
    const options = {
      admin: isAdmin(req),
      siteUrl: getSiteUrl(req),
      canonicalPath: pathname,
    };
    const notFound = () =>
      send(
        res,
        layout(
          'Niet gevonden',
          '<section class="panel"><h1>Deze pagina bestaat niet</h1><a href="/">Terug naar het archief</a></section>',
          { ...options, robots: 'noindex, follow' },
        ),
        404,
      );
    if (method === 'GET' && pathname === '/leeslijst') {
      res.setHeader('X-Robots-Tag', 'noindex, follow');
      send(
        res,
        layout('Mijn leeslijst', ui.libraryPage(), {
          ...options,
          robots: 'noindex, follow',
        }),
      );
      return true;
    }
    if (method === 'GET' && pathname === '/leeslijst/catalogus.json') {
      res.setHeader('X-Robots-Tag', 'noindex');
      send(
        res,
        JSON.stringify({
          posts: allPosts().map((post) => ({
            id: post.id,
            title: post.title,
            author: post.author,
          })),
        }),
        200,
        'application/json; charset=utf-8',
      );
      return true;
    }
    if (
      method === 'GET' &&
      (pathname === '/leesroutes' || /^\/leesroutes\/[^/]+$/.test(pathname))
    ) {
      const routes = availablePaths(allPosts());
      if (pathname === '/leesroutes')
        send(res, layout('Leesroutes', ui.pathsPage(routes), options));
      else {
        const route = routes.find(
          (route) => route.id === decodeURIComponent(pathname.split('/').pop()),
        );
        if (!route) notFound();
        else
          send(
            res,
            layout(route.title, ui.pathPage(route), {
              ...options,
              description: route.description,
            }),
          );
      }
      return true;
    }
    const attribution = pathname.match(
      /^\/bronvermelding\/([^/]+)(?:\/reacties\/([^/]+))?$/,
    );
    if (method === 'GET' && attribution) {
      const post = allPosts().find(
        (post) => post.id === decodeURIComponent(attribution[1]),
      );
      const key = attribution[2] && decodeURIComponent(attribution[2]);
      const reply =
        post &&
        key &&
        post.replies.find((reply, index) => replyKey(reply, index) === key);
      if (!post || (key && !reply)) notFound();
      else {
        const name = reply ? reply.author || 'Beheerder' : post.author;
        const person = authorData(name, pathname, getSiteUrl(req));
        send(
          res,
          layout(
            `Bronvermelding: ${name}`,
            ui.attributionPage(post, name, reply, key),
            {
              ...options,
              robots: 'noindex, follow',
              structuredData: {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                url: new URL(pathname, getSiteUrl(req)).href,
                name: `Bronvermelding: ${name}`,
                mainEntity: person,
              },
            },
          ),
        );
      }
      return true;
    }
    if (
      pathname !== '/admin/leesroutes' &&
      pathname !== '/admin/leesroutes/reset'
    )
      return false;
    if (requireAdmin(req, res)) return true;
    const posts = allPosts();
    const definitions = getPathDefinitions();
    if (method === 'GET' && pathname === '/admin/leesroutes') {
      const routes = readingPaths(posts, definitions);
      const id = req.urlObj.searchParams.get('id');
      const current =
        routes.find((route) => route.id === id) ||
        definitions.find((route) => route.id === id);
      if (id && !current) notFound();
      else
        send(
          res,
          layout(
            'Leesroutes beheren',
            ui.pathEditor(
              routes,
              posts,
              definitions,
              revision(definitions),
              current,
            ),
            { ...options, robots: 'noindex, nofollow' },
          ),
        );
      return true;
    }
    if (method !== 'POST') return false;
    const body = await readForm(req);
    // Re-read after the body arrived: a second tab may have saved meanwhile.
    const latest = getPathDefinitions();
    if (body.revision !== revision(latest)) {
      const draft = `Titel: ${body.title || ''}\nOmschrijving: ${body.description || ''}\nVerhalen: ${[
        1, 2, 3, 4, 5,
      ]
        .map((index) => body[`post${index}`])
        .filter(Boolean)
        .join(', ')}`;
      send(
        res,
        layout(
          'Leesroutes gewijzigd',
          `<section class="panel"><h1>De leesroutes zijn intussen gewijzigd</h1><p>Open de laatste versie voordat je verder bewerkt. Je invoer blijft hieronder beschikbaar.</p><textarea rows="10" readonly>${escapeHtml(draft)}</textarea><p><a href="/admin/leesroutes">Laatste versie openen</a></p></section>`,
          { ...options, robots: 'noindex, nofollow' },
        ),
        409,
      );
      return true;
    }
    if (pathname.endsWith('/reset')) {
      if (!latest.some((route) => route.id === body.id)) notFound();
      else {
        savePathDefinitions(latest.filter((route) => route.id !== body.id));
        redirect(res, '/admin/leesroutes');
      }
      return true;
    }
    const postIds = [1, 2, 3, 4, 5]
      .map((index) => body[`post${index}`])
      .filter(Boolean);
    const id =
      body.id ||
      `${themeId(body.title || 'leesroute')}-${crypto.randomBytes(3).toString('hex')}`;
    const definition = {
      id,
      title: (body.title || '').trim(),
      description: (body.description || '').trim(),
      postIds,
    };
    const next = [...latest.filter((route) => route.id !== id), definition];
    try {
      validatePathDefinitions(next);
      const existingIds = new Set(allPosts().map((post) => post.id));
      if (postIds.some((id) => !existingIds.has(id)))
        throw new Error('Missing story');
    } catch {
      throw Object.assign(
        new Error(
          'Kies drie tot vijf verschillende, bestaande verhalen en een korte titel.',
        ),
        { status: 400 },
      );
    }
    savePathDefinitions(next);
    redirect(res, `/admin/leesroutes?id=${encodeURIComponent(id)}`);
    return true;
  };
}
module.exports = { createReadingPages, availablePaths };
