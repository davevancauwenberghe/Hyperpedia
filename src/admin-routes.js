const crypto = require('node:crypto');
const { readForm } = require('./forms');
const { layout } = require('./layout');
const { send, redirect } = require('./http');
const { getSiteUrl } = require('./origin');
const { escapeHtml } = require('./html');
const { version: APP_VERSION } = require('../package.json');
const {
  loginPage,
  loginPageOptions,
  adminPostForm,
  adminDashboard,
  postRevision,
  editConflict,
} = require('./admin-ui');

async function collect(req) {
  const body = await readForm(req);
  if (req.urlObj.pathname.startsWith('/admin/')) {
    const fields = req.urlObj.pathname.startsWith('/admin/reply/')
      ? ['author', 'body']
      : ['author', 'title', 'body'];
    if (
      fields.some((key) => !body[key]?.trim()) ||
      (body.title || '').length > 300 ||
      (body.author || '').length > 200 ||
      (body.originalReplier || '').length > 200 ||
      (body.labels || '').length > 2000
    ) {
      throw Object.assign(
        new Error('Vul een titel, auteur en tekst in; houd titel en auteur kort.'),
        { status: 400 },
      );
    }
  }
  return body;
}
function parseLabels(value) {
  return [
    ...new Set(
      String(value || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
}

function createAdminRoutes({ store, auth, readLoginBody, requireAdmin }) {
  const {
    allPosts,
    postsForEdit,
    savePosts,
    purgePostRead,
    getStats,
    checkAdminCredentials,
    getPathExport,
  } = store;
  async function route(req, res, method) {
    const pathname = req.urlObj.pathname;
    if (method === 'GET' && /^\/admin\/read-metrics\/[^/]+\/purge$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const postId = decodeURIComponent(pathname.split('/')[3]);
      const post = store.getPost(postId);
      if (!post) return send(res, 'Niet gevonden', 404);
      return send(
        res,
        layout(
          'Leesteller wissen',
          `<section class="panel"><h1>Leesteller wissen?</h1><p>Dit zet de leesteller van “${escapeHtml(post.title)}” terug op nul. Het verhaal en de reacties blijven bewaard.</p><form method="post" action="${escapeHtml(pathname)}" class="form-actions"><input type="hidden" name="confirmation" value="yes"><button class="danger">Ja, teller wissen</button><a class="button secondary" href="/admin">Annuleren</a></form></section>`,
          { admin: true, robots: 'noindex, nofollow', siteUrl: getSiteUrl(req) },
        ),
      );
    }
    if (method === 'POST' && /^\/admin\/read-metrics\/[^/]+\/purge$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const [, , , postId] = pathname.split('/').map(decodeURIComponent);
      if (!allPosts().some((post) => post.id === postId)) return send(res, 'Niet gevonden', 404);
      const body = await readForm(req);
      if (body.confirmation !== 'yes')
        return send(res, 'Bevestig het wissen via het beheeroverzicht.', 400);
      purgePostRead(postId);
      return redirect(res, '/admin');
    }
    if (method === 'GET' && pathname === '/login')
      return send(res, layout('Login', loginPage(), loginPageOptions(req)));
    if (method === 'POST' && pathname === '/login') {
      const key = auth.loginKey(req);
      // Upload admission and deadlines are independent of password-verification slots.
      const body = await readLoginBody(req, key);
      const retry = auth.beginLogin(key);
      if (retry) {
        res.setHeader('Retry-After', String(retry));
        return send(
          res,
          layout(
            'Login',
            loginPage(`Wacht ${retry} seconden voordat je opnieuw probeert in te loggen.`),
            loginPageOptions(req),
          ),
          429,
        );
      }
      try {
        const valid = await checkAdminCredentials(body.username, body.password || '');
        const lock = auth.endLogin(key, valid);
        if (!valid) {
          if (lock) res.setHeader('Retry-After', String(lock));
          const message = lock
            ? 'Te veel mislukte pogingen. Wacht 60 seconden voordat je het opnieuw probeert.'
            : 'Inloggen mislukt. Controleer je gebruikersnaam en wachtwoord.';
          return send(
            res,
            layout('Login', loginPage(message), loginPageOptions(req)),
            lock ? 429 : 401,
          );
        }
        res.writeHead(302, {
          Location: '/admin',
          'Set-Cookie': auth.createSession(req, body.remember === 'yes'),
        });
        return res.end();
      } finally {
        auth.cancelLogin(key);
      }
    }
    if (method === 'POST' && pathname === '/logout') {
      res.writeHead(302, { Location: '/', 'Set-Cookie': auth.logout(req) });
      return res.end();
    }
    if (method === 'GET' && pathname === '/admin/export') {
      if (requireAdmin(req, res)) return;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="hyperpedia-archive-v${APP_VERSION}.json"`,
      );
      return send(
        res,
        JSON.stringify(
          {
            schemaVersion: 1,
            appVersion: APP_VERSION,
            exportedAt: new Date().toISOString(),
            posts: allPosts(),
            ...getPathExport(),
          },
          null,
          2,
        ),
        200,
        'application/json; charset=utf-8',
      );
    }
    if (method === 'GET' && pathname === '/admin') {
      if (requireAdmin(req, res)) return;
      return send(
        res,
        layout('Beheer', adminDashboard(getStats()), { admin: true, robots: 'noindex, nofollow' }),
      );
    }
    if (method === 'POST' && pathname === '/admin/posts') {
      if (requireAdmin(req, res)) return;
      const body = await collect(req);
      const posts = postsForEdit();
      const id = crypto.randomBytes(6).toString('base64url');
      const timestamp = new Date().toISOString();
      posts.push({
        id,
        author: body.author.trim(),
        title: body.title.trim(),
        body: body.body,
        labels: parseLabels(body.labels),
        replies: [],
        created_at: timestamp,
        updated_at: timestamp,
      });
      savePosts(posts);
      return redirect(res, `/posts/${id}`);
    }

    if (method === 'GET' && /^\/admin\/reply\/[^/]+\/[^/]+\/edit$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
      const p = allPosts().find((x) => x.id === postId);
      const reply = p?.replies?.find((x) => x.id === replyId);
      if (!p || !reply) return send(res, 'Niet gevonden', 404);
      return send(
        res,
        layout(
          'Reactie bewerken',
          `<section class="panel"><h1>Reactie bewerken</h1><form method="post" action="/admin/reply/${encodeURIComponent(p.id)}/${encodeURIComponent(reply.id)}/edit" class="stack"><input type="hidden" name="revision" value="${postRevision(p)}"><label>Naam originele replier<input name="originalReplier" value="${escapeHtml(reply.originalReplier || p.author)}" required></label><label>Naam beheerder<input name="author" value="${escapeHtml(reply.author || 'Beheerder')}" required></label><label>Reactie<textarea name="body" rows="6" required>${escapeHtml(reply.body)}</textarea></label><div class="form-actions"><button>Reactie bijwerken</button><a class="button secondary" href="/posts/${encodeURIComponent(p.id)}">Annuleren</a></div></form></section>`,
          { admin: true, robots: 'noindex, nofollow' },
        ),
      );
    }
    if (method === 'POST' && /^\/admin\/reply\/[^/]+\/[^/]+\/edit$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
      const body = await collect(req);
      const posts = postsForEdit();
      const p = posts.find((x) => x.id === postId);
      const reply = p?.replies?.find((x) => x.id === replyId);
      if (!p || !reply) return send(res, 'Niet gevonden', 404);
      if (body.revision !== postRevision(p)) return editConflict(req, res, body, postId, replyId);
      Object.assign(reply, {
        originalReplier: (body.originalReplier || p.author).trim(),
        author: body.author.trim(),
        body: body.body,
        updated_at: new Date().toISOString(),
      });
      p.updated_at = new Date().toISOString();
      savePosts(posts);
      return redirect(res, `/posts/${encodeURIComponent(postId)}`);
    }
    if (method === 'POST' && /^\/admin\/reply\/[^/]+\/[^/]+\/delete$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
      const body = await readForm(req);
      const posts = postsForEdit();
      const p = posts.find((x) => x.id === postId);
      if (!p) return send(res, 'Niet gevonden', 404);
      const index = p.replies.findIndex((reply) => reply.id === replyId);
      if (index < 0) return send(res, 'Niet gevonden', 404);
      if (body.revision !== postRevision(p)) return editConflict(req, res, body, postId, replyId);
      p.replies.splice(index, 1);
      p.updated_at = new Date().toISOString();
      savePosts(posts);
      return redirect(res, `/posts/${encodeURIComponent(postId)}`);
    }
    if (method === 'POST' && /^\/admin\/reply\/[^/]+$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split('/').pop());
      const body = await collect(req);
      const posts = postsForEdit();
      const post = posts.find((item) => item.id === id);
      if (!post) return send(res, 'Niet gevonden', 404);
      const timestamp = new Date().toISOString();
      post.replies.push({
        id: crypto.randomBytes(6).toString('base64url'),
        originalReplier: (body.originalReplier || post.author).trim(),
        author: body.author.trim(),
        body: body.body,
        created_at: timestamp,
      });
      post.updated_at = timestamp;
      savePosts(posts);
      return redirect(res, `/posts/${encodeURIComponent(id)}`);
    }
    if (method === 'GET' && /^\/admin\/edit\/[^/]+$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split('/').pop());
      const p = allPosts().find((x) => x.id === id);
      if (!p) return send(res, 'Niet gevonden', 404);
      return send(
        res,
        layout('Bewerken', adminPostForm(p), { admin: true, robots: 'noindex, nofollow' }),
      );
    }
    if (method === 'POST' && /^\/admin\/edit\/[^/]+$/.test(pathname)) {
      if (requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split('/').pop());
      const body = await collect(req);
      const posts = postsForEdit();
      const post = posts.find((item) => item.id === id);
      if (!post) return send(res, 'Niet gevonden', 404);
      if (body.revision !== postRevision(post)) return editConflict(req, res, body, id);
      Object.assign(post, {
        author: body.author.trim(),
        title: body.title.trim(),
        body: body.body,
        labels: parseLabels(body.labels),
        updated_at: new Date().toISOString(),
      });
      savePosts(posts);
      return redirect(res, `/posts/${encodeURIComponent(id)}`);
    }
  }
  return async (req, res, method) => {
    const pathname = req.urlObj.pathname;
    if (
      pathname !== '/login' &&
      pathname !== '/logout' &&
      pathname !== '/admin' &&
      !pathname.startsWith('/admin/')
    )
      return false;
    await route(req, res, method);
    return res.writableEnded;
  };
}
module.exports = { createAdminRoutes };
