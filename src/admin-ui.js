const crypto = require('node:crypto');
const { escapeHtml } = require('./html');
const { icon } = require('./icons');
const { layout } = require('./layout');
const { send } = require('./http');
const { getSiteUrl } = require('./origin');

function loginPage(message = '') {
  return `<section class="login-hero"><div><p class="eyebrow">Portal</p><h1>Beheerlogin</h1><p>Log in om het Hyperpedia-archief aan te vullen, verhalen bij te werken en reacties te beheren.</p></div><div class="login-card stack">${message ? `<p class="login-error" role="alert">${escapeHtml(message)}</p>` : ''}<form method="post" action="/login" class="stack"><label>Gebruikersnaam<input name="username" autocomplete="username" required></label><label>Wachtwoord<input name="password" type="password" autocomplete="current-password" required></label><label class="checkbox-field"><input type="checkbox" name="remember" value="yes"> 7 dagen aangemeld blijven (gebruikt een cookie)</label><button>Inloggen</button></form></div></section>`;
}
function loginPageOptions(req) {
  return { canonicalPath: '/login', siteUrl: getSiteUrl(req), robots: 'noindex, nofollow' };
}
function adminPostForm(post = null) {
  const editing = Boolean(post);
  return `<section class="panel admin-form-panel"><${editing ? 'h1' : 'h2'}>${editing ? 'Verhaal bewerken' : 'Nieuw verhaal toevoegen'}</${editing ? 'h1' : 'h2'}><form method="post" action="${editing ? `/admin/edit/${encodeURIComponent(post.id)}` : '/admin/posts'}" class="stack editor-grid">${editing ? `<input type="hidden" name="revision" value="${postRevision(post)}">` : ''}<label class="field-wide">Titel<input name="title" value="${escapeHtml(post?.title || '')}" maxlength="300" required></label><label>Naam oorspronkelijke auteur<input name="author" value="${escapeHtml(post?.author || '')}" maxlength="200" required></label><label><span>Labels <small>komma-gescheiden</small></span><input name="labels" value="${escapeHtml((post?.labels || []).join(', '))}" placeholder="ademhaling, duizeligheid, geruststelling" maxlength="2000"></label><label class="field-wide">Forumtekst<textarea name="body" rows="14" required>${escapeHtml(post?.body || '')}</textarea></label><div class="form-actions field-wide"><button>${editing ? 'Bijwerken' : 'Opslaan'}</button>${editing ? `<a class="button secondary" href="/posts/${encodeURIComponent(post.id)}">Annuleren</a>` : ''}</div></form></section>`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('nl-NL').format(value);
}
function adminDashboard(stats) {
  const topReadCount = stats.postReads.reduce((max, post) => Math.max(max, post.read_count), 1);
  const topReadPosts = stats.postReads.slice(0, 5);
  const readRows = topReadPosts
    .map(
      (post) =>
        `<li><div><a href="/posts/${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a></div><meter min="0" max="${topReadCount}" value="${post.read_count}"></meter><strong>${formatNumber(post.read_count)}</strong><a class="button danger" href="/admin/read-metrics/${encodeURIComponent(post.id)}/purge">Teller wissen</a></li>`,
    )
    .join('');
  return `<section class="admin-overview"><div><p class="eyebrow">Beheerder portal</p><h1>Overzicht</h1><p>Volg in één oogopslag hoeveel verhalen zijn ingevoerd, gelezen en beantwoord.</p><a class="button secondary" href="/admin/export">${icon('download')} Archief exporteren</a><a class="button secondary" href="/admin/leesroutes">${icon('route')} Leesroutes beheren</a></div><div class="stats-grid"><article><span>${formatNumber(stats.readCount)}</span><p>Gelezen posts</p></article><article><span>${formatNumber(stats.postCount)}</span><p>Ingevoerde posts</p></article><article><span>${formatNumber(stats.replyCount)}</span><p>Reacties</p></article></div></section><div class="admin-workspace"><section class="panel metrics-panel"><div class="section-heading"><p class="eyebrow">Leesstatistieken</p><h2>Reads per post</h2><p>Een handig overzicht van welke vijf verhalen het vaakst zijn geopend.</p></div><ol class="read-metrics">${readRows || '<li class="empty">Nog geen verhalen om te meten.</li>'}</ol></section>${adminPostForm()}</div>`;
}
function adminReplyForm(post) {
  return `<section class="panel reply-panel"><h2>Reactie toevoegen</h2><form method="post" action="/admin/reply/${encodeURIComponent(post.id)}" class="stack"><label>Naam originele replier<input name="originalReplier" value="${escapeHtml(post.author)}" required></label><label>Naam beheerder<input name="author" value="Beheerder" required></label><label>Reactie<textarea name="body" rows="6" required placeholder="Schrijf hier je reactie…"></textarea></label><button>Reactie opslaan</button></form></section>`;
}
function postRevision(post) {
  return crypto.createHash('sha256').update(JSON.stringify(post)).digest('hex');
}
function editConflict(req, res, body, postId, replyId) {
  const draft = replyId
    ? `Naam originele replier: ${body.originalReplier || ''}\nNaam beheerder: ${body.author || ''}\n\n${body.body || ''}`
    : `Titel: ${body.title || ''}\nAuteur: ${body.author || ''}\nLabels: ${body.labels || ''}\n\n${body.body || ''}`;
  const editorPath = replyId
    ? `/admin/reply/${encodeURIComponent(postId)}/${encodeURIComponent(replyId)}/edit`
    : `/admin/edit/${encodeURIComponent(postId)}`;
  const title = replyId ? 'Reactie opnieuw openen' : 'Verhaal gewijzigd';
  const heading = replyId
    ? 'Dit verhaal of deze reactie is intussen gewijzigd'
    : 'Dit verhaal is intussen gewijzigd';
  return send(
    res,
    layout(
      title,
      `<section class="panel"><h1>${heading}</h1><p>Open de laatste versie voordat je verder bewerkt. Je ingevoerde tekst staat hieronder zodat je die kunt kopiëren.</p><label class="stack">Jouw invoer<textarea rows="14" readonly>${escapeHtml(draft)}</textarea></label><p><a class="button" href="${editorPath}">Laatste versie openen</a></p></section>`,
      { admin: true, siteUrl: getSiteUrl(req), robots: 'noindex, nofollow' },
    ),
    409,
  );
}

module.exports = {
  loginPage,
  loginPageOptions,
  adminPostForm,
  adminDashboard,
  adminReplyForm,
  formatNumber,
  postRevision,
  editConflict,
};
