const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isoDate: toIsoDate, sitemapDocuments } = require('./seo');
const { version: APP_VERSION } = require('../package.json');
const { icon } = require('./icons');
const { createAuth } = require('./auth');
const { readForm, createLoginBodyReader } = require('./forms');
const { searchPosts, storiesOfTheDay, pageSize } = require('./archive');
const { allPosts, savePosts, recordPostRead, purgePostRead, getStats, getAdmin, verifyPasswordAsync } = require('./store');
const auth = createAuth();
const readLoginBody = createLoginBodyReader();
const POSTS_PER_PAGE = 18;

const layout = (title, content, { admin = false, error = '', notice = '', description = 'Hyperpedia verzamelt herkenbare verhalen over hyperventilatie, stress en lichamelijke sensaties.', canonicalPath = '/', siteUrl = getSiteUrl(), type = 'website', robots = 'index, follow', structuredData = null, post = null } = {}) => {
  const socialImage = new URL('/social-preview.png', siteUrl).href;
  const canonicalUrl = new URL(canonicalPath, siteUrl).toString();
  const metaDescription = escapeHtml(description);
  const safeTitle = escapeHtml(`${title} · Hyperpedia`);
  return `<!doctype html>
<html lang="nl" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="description" content="${metaDescription}">
  <meta name="theme-color" content="#f7f1e8">
  <meta name="color-scheme" content="light dark">
  <script src="/theme.js?v=${APP_VERSION}"></script>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <meta name="apple-mobile-web-app-title" content="Hyperpedia">
  <meta name="application-name" content="Hyperpedia">
  <link rel="manifest" href="/site.webmanifest">
  <meta name="robots" content="${escapeHtml(robots)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:locale" content="nl_BE">
  <meta property="og:site_name" content="Hyperpedia">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
  <meta property="og:image:alt" content="Hyperpedia — verhalen die geruststellen">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${metaDescription}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <meta name="twitter:image:alt" content="Hyperpedia — verhalen die geruststellen">
  ${post ? [['published_time', toIsoDate(post.created_at)], ['modified_time', toIsoDate(post.updated_at)]].filter(([, value]) => value).map(([key, value]) => `<meta property="article:${key}" content="${value}">`).join('\n') : ''}
  <meta name="twitter:card" content="summary_large_image">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="/style.css?v=${APP_VERSION}">
  ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
  <a class="skip-link" href="#main-content">Ga naar de inhoud</a>
  <header class="site-header">
    <a class="brand" href="/"><img class="brand-mark" src="/favicon.svg" width="44" height="44" alt=""><span class="brand-copy"><span class="brand-title">Hyperpedia</span><small>verhalen die geruststellen</small></span></a>
    <nav aria-label="Hoofdnavigatie">
      ${admin ? '<a class="nav-button" href="/admin">Overzicht</a><form method="post" action="/logout"><button>Uitloggen</button></form>' : ''}
      <button class="theme-toggle" type="button" aria-label="Donker thema gebruiken" aria-pressed="false">${icon('moon')}${icon('sun')}</button>
    </nav>
  </header>
  <main id="main-content" tabindex="-1">
    ${error ? `<p class="flash error">${escapeHtml(error)}</p>` : ''}
    ${notice ? `<p class="flash notice">${escapeHtml(notice)}</p>` : ''}
    ${content}
  </main>
  <footer class="site-footer"><div class="footer-note"><strong>Goed om te weten</strong><p>De verhalen op Hyperpedia zijn persoonlijke ervaringen, geen medisch advies. Bespreek nieuwe, ernstige of aanhoudende klachten altijd met je zorgverlener.</p></div><div class="footer-actions"><button class="footer-info-link" type="button" data-info-open>Over dit archief</button><span class="site-version">v${APP_VERSION}</span></div></footer>
  <dialog class="info-dialog" aria-labelledby="info-dialog-title" data-info-dialog>
    <div class="info-dialog-card">
      <button class="info-dialog-close" type="button" aria-label="Sluit meer informatie" data-info-close>${icon('close')}</button>
      <p class="eyebrow">Waarom Hyperpedia?</p>
      <h2 id="info-dialog-title">Een archief voor (h)erkenning</h2>
      <p>Hyperpedia is opgezet om oudere berichten uit de voormalige fora Angstfobietherapie en Therapiepsycholoog te archiveren en toegankelijk te houden, mocht die informatie ooit verdwijnen.</p>
      <p>Omdat beide fora gesloten zijn voor nieuwe posts en reacties, blijft Hyperpedia bewust een leesarchief. Het doel is herkenning en context bieden, zonder dat het verandert in geruststelling zoeken of medisch advies.</p>
      <div class="info-dialog-actions"><button type="button" data-info-close>Ik begrijp het</button></div>
    </div>
  </dialog>
  <script src="/app.js?v=${APP_VERSION}"></script>
  <script src="/archive.js?v=${APP_VERSION}"></script>
</body>
</html>`;
};


function getSiteUrl(req) {
  const configured = process.env.SITE_URL;
  if (configured) {
    const siteUrl = new URL(configured);
    siteUrl.pathname = '/';
    siteUrl.search = '';
    siteUrl.hash = '';
    return siteUrl.toString();
  }
  if (!req) return 'http://localhost/';
  const proto = firstForwardedValue(req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
  const host = firstForwardedValue(req.headers['x-forwarded-host']) || firstForwardedValue(req.headers.host) || 'localhost';
  return `${proto}://${host}/`;
}
function firstForwardedValue(value = '') {
  const header = Array.isArray(value) ? value[0] : value;
  return String(header || '').split(',')[0].trim();
}
function redirectToCanonicalOrigin(req, res) {
  if (!process.env.SITE_URL) return false;

  const canonical = new URL(getSiteUrl());
  const requestProtocol = firstForwardedValue(req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
  const requestHost = firstForwardedValue(req.headers['x-forwarded-host']) || firstForwardedValue(req.headers.host);
  if (!requestHost || (requestProtocol === canonical.protocol.slice(0, -1) && requestHost.toLowerCase() === canonical.host.toLowerCase())) return false;

  const target = new URL(canonical);
  target.pathname = req.urlObj.pathname;
  target.search = req.urlObj.search;
  res.writeHead(308, { Location: target.toString() });
  res.end();
  return true;
}
function toSeoDescription(value, fallback) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  return compact ? `${compact.slice(0, 155)}${compact.length > 155 ? '…' : ''}` : fallback;
}
function renderStoriesOfTheDay(posts) {
  if (!posts.length) return '';
  const slides = posts.map((post, index) => `<div class="daily-story-slide${index === 0 ? ' is-active' : ''}" id="daily-story-${index + 1}" role="group" aria-roledescription="slide" aria-label="Verhaal ${index + 1} van ${posts.length}"${index === 0 ? '' : ' hidden aria-hidden="true"'}>${postCard(post)}</div>`).join('');
  const dots = posts.map((_, index) => `<button type="button" class="daily-story-dot${index === 0 ? ' is-active' : ''}" aria-label="Toon verhaal ${index + 1}" aria-controls="daily-story-${index + 1}"${index === 0 ? ' aria-current="true"' : ''}></button>`).join('');
  if (posts.length === 1) return `<div class="daily-story-frame"><div class="daily-story-track">${slides}</div></div>`;
  return `<div class="daily-story-frame" data-daily-stories><div class="daily-story-track" aria-live="polite">${slides}</div><div class="daily-story-controls"><button type="button" class="daily-story-arrow" data-daily-prev aria-label="Vorig verhaal">${icon('left')}</button><div class="daily-story-dots" aria-label="Verhalen van de dag navigatie">${dots}</div><button type="button" class="daily-story-arrow" data-daily-next aria-label="Volgend verhaal">${icon('right')}</button></div></div>`;
}
function personStructuredData(name) {
  return { '@type': 'Person', name };
}
function homepageStructuredData(posts, req) {
  const siteUrl = getSiteUrl(req);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Hyperpedia',
    url: siteUrl,
    description: 'Een rustige encyclopedie met herkenbare forumverhalen over lichamelijke stresssignalen.',
    potentialAction: { '@type': 'SearchAction', target: `${siteUrl}?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
    mainEntity: posts.slice(0, 12).map(post => {
      const url = new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).toString();
      return { '@type': 'DiscussionForumPosting', headline: post.title, datePublished: toIsoDate(post.created_at), author: personStructuredData(post.author), url };
    }),
  };
}
function postStructuredData(post, req) {
  const siteUrl = getSiteUrl(req);
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: post.title,
    text: post.body,
    author: personStructuredData(post.author),
    datePublished: toIsoDate(post.created_at),
    dateModified: toIsoDate(post.updated_at) || toIsoDate(post.created_at),
    inLanguage: 'nl',
    commentCount: (post.replies || []).length,
    comment: (post.replies || []).map(reply => ({ '@type': 'Comment', text: reply.body, author: personStructuredData(reply.author || 'Beheerder'), datePublished: toIsoDate(reply.created_at), dateModified: toIsoDate(reply.updated_at) })),
    image: new URL('/social-preview.png', siteUrl).href,
    mainEntityOfPage: new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).href,
    keywords: (post.labels || []).join(', '),
    url: new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).toString(),
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function isAdmin(req) { return Boolean(req.admin); }
function requireAdmin(req, res) { if (!isAdmin(req)) { redirect(res, '/login'); return true; } return false; }
function redirect(res, to, code = 302) { res.writeHead(code, { Location: to }); res.end(); }
function send(res, html, code = 200, type = 'text/html; charset=utf-8') { res.writeHead(code, { 'Content-Type': type }); res.end(html); }
async function collect(req) {
  const body = await readForm(req);
  if (req.urlObj.pathname.startsWith('/admin/')) {
    const fields = req.urlObj.pathname.startsWith('/admin/reply/') ? ['author', 'body'] : ['author', 'title', 'body'];
    if (fields.some(key => !body[key]?.trim()) || (body.title || '').length > 300 || (body.author || '').length > 200 || (body.labels || '').length > 2000) {
      throw Object.assign(new Error('Vul een titel, auteur en tekst in; houd titel en auteur kort.'), { status: 400 });
    }
  }
  return body;
}
function parseLabels(value) { return [...new Set(String(value || '').split(',').map(v => v.trim()).filter(Boolean))].slice(0, 12); }
function postCard(post, { backPath = '' } = {}) {
  const url = `/posts/${encodeURIComponent(post.id)}${backPath && backPath !== '/' ? `?from=${encodeURIComponent(backPath)}` : ''}`;
  const labels = post.labels || [];
  return `<article class="card" data-story-id="${escapeHtml(post.id)}"><div class="card-top"><p class="eyebrow">${escapeHtml(post.author)}</p>${labels.map(l => `<a class="label" href="/?label=${encodeURIComponent(l)}">${escapeHtml(l)}</a>`).join('')}</div><h2><a href="${escapeHtml(url)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.body.slice(0, 230))}${post.body.length > 230 ? '…' : ''}</p><div class="card-actions"><a class="button secondary" href="${escapeHtml(url)}" aria-label="Lees verder: ${escapeHtml(post.title)}">Lees verder</a>${(post.replies || []).length ? `<span class="reply-count">${post.replies.length} reactie${post.replies.length === 1 ? '' : 's'}</span>` : ''}</div></article>`;
}

function pageUrl({ q = '', label = '', page = 1, perPage = POSTS_PER_PAGE } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (label) params.set('label', label);
  if (page > 1) params.set('page', String(page));
  if (perPage !== POSTS_PER_PAGE) params.set('perPage', String(perPage));
  const query = params.toString();
  return `/${query ? `?${query}` : ''}`;
}
function homepageCanonicalPath({ q = '', label = '', page = 1 } = {}) {
  return q ? '/' : pageUrl({ label, page });
}
function renderPagination({ q = '', label = '', page = 1, totalPages = 1, totalPosts = 0, perPage = POSTS_PER_PAGE } = {}) {
  if (totalPages <= 1) return '';

  const firstVisiblePage = Math.min(Math.max(page - 1, 1), Math.max(totalPages - 2, 1));
  const pages = Array.from({ length: Math.min(3, totalPages) }, (_, index) => firstVisiblePage + index);
  const pageOptions = Array.from({ length: totalPages }, (_, index) => index + 1).map(number => `<option value="${escapeHtml(pageUrl({ q, label, page: number, perPage }))}"${number === page ? ' selected' : ''}>Pagina ${number} van ${totalPages}</option>`).join('');
  return `<nav class="pagination" aria-label="Forum posts pagina's"><label class="page-picker"><span class="visually-hidden">Ga naar pagina</span><select data-page-select aria-label="Pagina ${page} van ${totalPages}; selecteer een pagina">${pageOptions}</select><span>· ${formatNumber(totalPosts)} verhalen</span></label><div><a class="button secondary${page === 1 ? ' disabled' : ''}" href="${page === 1 ? '#' : pageUrl({ q, label, page: page - 1, perPage })}" aria-label="Vorige pagina"${page === 1 ? ' aria-disabled="true" tabindex="-1"' : ''}>${icon('left')} Vorige</a>${pages.map(number => number === page ? `<span class="page-current" aria-current="page">${number}</span>` : `<a class="page-link" href="${pageUrl({ q, label, page: number, perPage })}">${number}</a>`).join('')}<a class="button secondary${page === totalPages ? ' disabled' : ''}" href="${page === totalPages ? '#' : pageUrl({ q, label, page: page + 1, perPage })}" aria-label="Volgende pagina"${page === totalPages ? ' aria-disabled="true" tabindex="-1"' : ''}>Volgende ${icon('right')}</a></div></nav>`;
}

function burnoutInsightCta() {
  return `<section class="external-forum-cta" aria-labelledby="burnout-insight-title"><div><p class="eyebrow">Nieuwe vragen stellen</p><h2 id="burnout-insight-title">Zoek je een actieve plek om verder te praten?</h2><p>Hyperpedia bewaart oudere forumverhalen als archief. Wil je zelf anoniem delen, reageren op anderen of herkenning vinden bij mensen die nu hetzelfde meemaken? Bezoek dan het forum van Burnout Insight en kom in contact met lotgenoten.</p></div><a class="button" href="https://www.burnoutinsight.com" target="_blank" rel="noopener noreferrer">Naar Burnout Insight</a></section>`;
}

function loginPage(message = '') {
  return `<section class="login-hero"><div><p class="eyebrow">Portal</p><h1>Beheerlogin</h1><p>Log in om het Hyperpedia-archief aan te vullen, verhalen bij te werken en reacties te beheren.</p></div><div class="login-card stack">${message ? `<p class="login-error" role="alert">${escapeHtml(message)}</p>` : ''}<form method="post" action="/login" class="stack"><label>Gebruikersnaam<input name="username" autocomplete="username" required></label><label>Wachtwoord<input name="password" type="password" autocomplete="current-password" required></label><button>Inloggen</button></form></div></section>`;
}
function loginPageOptions(req) {
  return { canonicalPath: '/login', siteUrl: getSiteUrl(req), robots: 'noindex, nofollow' };
}
function renderText(value) {
  return String(value || '').replace(/\r\n/g, '\n').split(/\n\s*\n/).map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
}
function renderReplies(post, { admin = false } = {}) {
  const replies = post.replies || [];
  if (!replies.length) return '';

  return `<section class="replies" aria-labelledby="replies-title"><h2 id="replies-title">Reacties</h2>${replies.map(reply => `<article class="reply"><p class="eyebrow">Reactie op ${escapeHtml(reply.originalReplier || post.author)}</p><h3>${escapeHtml(reply.author || 'Beheerder')}</h3><div>${renderText(reply.body)}</div>${admin ? `<div class="reply-actions"><a class="button secondary" href="/admin/reply/${encodeURIComponent(post.id)}/${encodeURIComponent(reply.id)}/edit">Reactie bewerken</a><form method="post" action="/admin/reply/${encodeURIComponent(post.id)}/${encodeURIComponent(reply.id)}/delete"><button class="danger" type="submit">Reactie verwijderen</button></form></div>` : ''}</article>`).join('')}</section>`;
}

function storySidebar(post, archive) {
  const labels = new Set(post.labels || []);
  const related = archive.filter(item => item.id !== post.id)
    .map(item => ({ item, overlap: (item.labels || []).filter(label => labels.has(label)).length }))
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.item.title.localeCompare(b.item.title, 'nl'))
    .slice(0, 3).map(({ item }) => item);
  return `<aside class="story-sidebar" aria-label="Verder in het archief">${labels.size ? `<section class="sidebar-panel"><p class="eyebrow">In dit verhaal</p><h2>Thema's</h2><div class="labels">${[...labels].map(label => `<a class="label" href="/?label=${encodeURIComponent(label)}">${escapeHtml(label)}</a>`).join('')}</div></section>` : ''}${related.length ? `<section class="sidebar-panel related-stories"><p class="eyebrow">Verder lezen</p><h2>Misschien herken je dit ook</h2>${related.map(item => `<a class="related-story" href="/posts/${encodeURIComponent(item.id)}"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.author)}</small><span class="related-arrow">${icon('external')}</span></a>`).join('')}</section>` : ''}<a class="sidebar-back" href="/">Bekijk alle verhalen ${icon('right')}</a></aside>`;
}

function adminPostForm(post = null) {
  const editing = Boolean(post);
  return `<section class="panel admin-form-panel"><${editing ? 'h1' : 'h2'}>${editing ? 'Verhaal bewerken' : 'Nieuw verhaal toevoegen'}</${editing ? 'h1' : 'h2'}><form method="post" action="${editing ? `/admin/edit/${encodeURIComponent(post.id)}` : '/admin/posts'}" class="stack editor-grid">${editing ? `<input type="hidden" name="revision" value="${postRevision(post)}">` : ''}<label class="field-wide">Titel<input name="title" value="${escapeHtml(post?.title || '')}" maxlength="300" required></label><label>Naam oorspronkelijke auteur<input name="author" value="${escapeHtml(post?.author || '')}" maxlength="200" required></label><label><span>Labels <small>komma-gescheiden</small></span><input name="labels" value="${escapeHtml((post?.labels || []).join(', '))}" placeholder="ademhaling, duizeligheid, geruststelling" maxlength="2000"></label><label class="field-wide">Forumtekst<textarea name="body" rows="14" required>${escapeHtml(post?.body || '')}</textarea></label><div class="form-actions field-wide"><button>${editing ? 'Bijwerken' : 'Opslaan'}</button>${editing ? `<a class="button secondary" href="/posts/${encodeURIComponent(post.id)}">Annuleren</a>` : ''}</div></form></section>`;
}

function formatNumber(value) { return new Intl.NumberFormat('nl-NL').format(value); }
function adminDashboard() {
  const stats = getStats();
  const topReadCount = stats.postReads.reduce((max, post) => Math.max(max, post.read_count), 1);
  const topReadPosts = stats.postReads.slice(0, 5);
  const readRows = topReadPosts.map(post => `<li><div><a href="/posts/${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a></div><meter min="0" max="${topReadCount}" value="${post.read_count}"></meter><strong>${formatNumber(post.read_count)}</strong><form method="post" action="/admin/read-metrics/${encodeURIComponent(post.id)}/purge"><button class="danger" type="submit">Purge</button></form></li>`).join('');
  return `<section class="admin-overview"><div><p class="eyebrow">Beheerder portal</p><h1>Overzicht</h1><p>Volg in één oogopslag hoeveel verhalen zijn ingevoerd, gelezen en beantwoord.</p><a class="button secondary" href="/admin/export">${icon('download')} Archief exporteren</a></div><div class="stats-grid"><article><span>${formatNumber(stats.readCount)}</span><p>Gelezen posts</p></article><article><span>${formatNumber(stats.postCount)}</span><p>Ingevoerde posts</p></article><article><span>${formatNumber(stats.replyCount)}</span><p>Reacties</p></article></div></section><div class="admin-workspace"><section class="panel metrics-panel"><div class="section-heading"><p class="eyebrow">Leesstatistieken</p><h2>Reads per post</h2><p>Een handig overzicht van welke vijf verhalen het vaakst zijn geopend.</p></div><ol class="read-metrics">${readRows || '<li class="empty">Nog geen verhalen om te meten.</li>'}</ol></section>${adminPostForm()}</div>`;
}
function adminReplyForm(post) {
  return `<section class="panel reply-panel"><h2>Reactie toevoegen</h2><form method="post" action="/admin/reply/${encodeURIComponent(post.id)}" class="stack"><label>Naam originele replier<input name="originalReplier" value="${escapeHtml(post.author)}" required></label><label>Naam beheerder<input name="author" value="Beheerder" required></label><label>Reactie<textarea name="body" rows="6" required placeholder="Schrijf hier je reactie…"></textarea></label><button>Reactie opslaan</button></form></section>`;
}
function withRequest(req) {
  auth.authenticate(req);
  req.urlObj = new URL(req.url, 'http://localhost');
}
function postRevision(post) { return crypto.createHash('sha256').update(JSON.stringify(post)).digest('hex'); }
function editConflict(req, res, body, postId, replyId) {
  const draft = replyId
    ? `Naam originele replier: ${body.originalReplier || ''}\nNaam beheerder: ${body.author || ''}\n\n${body.body || ''}`
    : `Titel: ${body.title || ''}\nAuteur: ${body.author || ''}\nLabels: ${body.labels || ''}\n\n${body.body || ''}`;
  const editorPath = replyId
    ? `/admin/reply/${encodeURIComponent(postId)}/${encodeURIComponent(replyId)}/edit`
    : `/admin/edit/${encodeURIComponent(postId)}`;
  const title = replyId ? 'Reactie opnieuw openen' : 'Verhaal gewijzigd';
  const heading = replyId ? 'Dit verhaal of deze reactie is intussen gewijzigd' : 'Dit verhaal is intussen gewijzigd';
  return send(res, layout(title, `<section class="panel"><h1>${heading}</h1><p>Open de laatste versie voordat je verder bewerkt. Je ingevoerde tekst staat hieronder zodat je die kunt kopiëren.</p><label class="stack">Jouw invoer<textarea rows="14" readonly>${escapeHtml(draft)}</textarea></label><p><a class="button" href="${editorPath}">Laatste versie openen</a></p></section>`, { admin: true, siteUrl: getSiteUrl(req), robots: 'noindex, nofollow' }), 409);
}
function backToArchive(value) {
  if (typeof value !== 'string' || !value.startsWith('/?') || value.length > 2000) return '/';
  const params = new URL(value, 'http://localhost').searchParams;
  const number = Number(params.get('page') || '1');
  return pageUrl({ q: (params.get('q') || '').trim().slice(0, 300), label: (params.get('label') || '').trim().slice(0, 200), page: Number.isSafeInteger(number) && number > 0 ? number : 1, perPage: pageSize(params.get('perPage')) });
}
function storyActions(post, siteUrl) {
  const url = new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).href;
  return `<div class="story-actions" data-story-actions hidden><button class="secondary" type="button" data-story-share>${icon('share')} Delen</button><button class="secondary" type="button" data-story-copy>${icon('copy')} Link kopiëren</button><button class="secondary" type="button" data-story-print>${icon('print')} Afdrukken</button><input class="share-url" aria-label="Link naar dit verhaal" value="${escapeHtml(url)}" readonly data-share-url hidden><p class="action-feedback" role="status" aria-live="polite" data-action-status></p></div>`;
}

async function handler(req, res) {
  withRequest(req);
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const pathname = req.urlObj.pathname;
  res.setHeader('X-Hyperpedia-Version', APP_VERSION);
  if (method === 'GET' && pathname === '/healthz') return send(res, 'ok\n', 200, 'text/plain; charset=utf-8');
  if (redirectToCanonicalOrigin(req, res)) return;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-cache');
  if (pathname.startsWith('/admin') || pathname === '/login' || pathname === '/logout' || req.admin) {
    res.setHeader('Cache-Control', 'private, no-store');
  }
  if (pathname.startsWith('/admin') || pathname === '/login' || pathname === '/logout') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (method === 'POST' && (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== new URL(getSiteUrl(req)).origin))) {
    return send(res, 'Dit formulier komt van een andere website.', 403);
  }
  if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, HEAD, POST'); return send(res, 'Methode niet toegestaan', 405); }
  const assets = { '/archive.js': 'application/javascript; charset=utf-8', '/style.css': 'text/css; charset=utf-8', '/app.js': 'application/javascript; charset=utf-8', '/theme.js': 'application/javascript; charset=utf-8', '/favicon.svg': 'image/svg+xml', '/favicon.ico': 'image/x-icon', '/favicon-48.png': 'image/png', '/apple-touch-icon.png': 'image/png', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/social-preview.png': 'image/png', '/social-preview.svg': 'image/svg+xml', '/site.webmanifest': 'application/manifest+json; charset=utf-8' };
  if (assets[pathname]) {
    if (method !== 'GET') { res.setHeader('Allow', 'GET, HEAD'); return send(res, 'Methode niet toegestaan', 405); }
    if (!req.admin) res.setHeader('Cache-Control', 'public, max-age=3600');
    return send(res, fs.readFileSync(path.join(__dirname, '..', 'public', pathname.slice(1))), 200, assets[pathname]);
  }
  if (method === 'GET' && pathname === '/robots.txt') return send(res, `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', getSiteUrl(req)).toString()}\n`, 200, 'text/plain; charset=utf-8');
  if (method === 'GET' && (pathname === '/sitemap.xml' || /^\/sitemaps\/[1-9]\d*\.xml$/.test(pathname))) {
    const sitemap = sitemapDocuments(allPosts(), getSiteUrl(req), POSTS_PER_PAGE);
    const xml = pathname === '/sitemap.xml' ? sitemap.root : sitemap.documents[Number(pathname.match(/\d+/)[0]) - 1];
    return send(res, xml || 'Niet gevonden', xml ? 200 : 404, xml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
  }
  if (method === 'GET' && pathname === '/') {
    const perPage = pageSize(req.urlObj.searchParams.get('perPage'));
    if (req.urlObj.searchParams.has('perPage') && (perPage === POSTS_PER_PAGE || String(perPage) !== req.urlObj.searchParams.get('perPage'))) {
      req.urlObj.searchParams.delete('perPage');
      return redirect(res, `${pathname}${req.urlObj.search}`, 308);
    }
    const q = (req.urlObj.searchParams.get('q') || '').trim();
    const label = (req.urlObj.searchParams.get('label') || '').trim();
    const archive = allPosts();
    let posts = searchPosts([...archive].sort((a,b)=>a.title.localeCompare(b.title,'nl')), q);
    if (label) posts = posts.filter(p => (p.labels || []).includes(label));
    const requestedPage = Number.parseInt(req.urlObj.searchParams.get('page') || '1', 10);
    const totalPosts = posts.length;
    const totalPages = Math.max(1, Math.ceil(totalPosts / perPage));
    const page = Math.min(Math.max(Number.isNaN(requestedPage) ? 1 : requestedPage, 1), totalPages);
    const normalizedPath = pageUrl({ q, label, page, perPage });
    if (req.urlObj.searchParams.has('page') && req.urlObj.searchParams.get('page') !== String(page)) return redirect(res, normalizedPath, 308);
    if (req.urlObj.searchParams.get('page') === '1') return redirect(res, normalizedPath, 308);
    const visiblePosts = posts.slice((page - 1) * perPage, page * perPage);
    const allLabels = [...new Set(archive.flatMap(p => p.labels || []))].sort((a,b)=>a.localeCompare(b,'nl'));
    const pagination = renderPagination({ q, label, page, totalPages, totalPosts, perPage });
    const dailyStories = storiesOfTheDay(archive);
    const resultTitle = q ? `Zoekresultaten voor “${escapeHtml(q)}”` : label ? `Verhalen over ${escapeHtml(label)}` : 'Alle verhalen';
    const pageTitle = `${q ? `Zoeken naar ${q}` : label ? `Verhalen over ${label}` : 'Ervaringen over hyperventilatie en overprikkeling'}${page > 1 ? ` – pagina ${page}` : ''}`;
    const description = label ? `Lees herkenbare ervaringen over ${label}, stress, ademhaling en lichamelijke sensaties op Hyperpedia.` : undefined;
    const labels = allLabels.map(l => { const selected = l === label; return `<a class="label${selected ? ' selected' : ''}" href="${selected ? pageUrl({ q, perPage }) : pageUrl({ q, label: l, perPage })}"${selected ? ' aria-current="true"' : ''}>${escapeHtml(l)}</a>`; }).join('');
    const content = `<section class="hero home-hero"><div class="hero-copy"><p class="eyebrow">Een rustig leesarchief</p><h1>Herkenning voor onrustige momenten</h1><p>Lees op je eigen tempo ervaringen over stress, ademhaling en vreemde lichamelijke sensaties. Soms helpt het al om te merken dat je niet de enige bent.</p><a class="hero-link" href="#find-stories-title">Ontdek het archief ${icon('external')}</a></div><section class="daily-stories" aria-labelledby="daily-stories-title"><div class="section-heading"><p class="eyebrow">Een verhaal voor vandaag</p><h2 id="daily-stories-title">Misschien herken je iets</h2></div>${renderStoriesOfTheDay(dailyStories)}</section></section><section class="toolbar" aria-labelledby="find-stories-title"><div class="section-heading"><p class="eyebrow">Vind herkenning</p><h2 id="find-stories-title">Waar wil je over lezen?</h2></div><form class="search-form" role="search">${perPage !== POSTS_PER_PAGE ? `<input type="hidden" name="perPage" value="${perPage}">` : ''}${label ? `<input type="hidden" name="label" value="${escapeHtml(label)}">` : ''}<label for="story-search">Zoek in alle verhalen en reacties</label><div class="search-controls"><input id="story-search" name="q" value="${escapeHtml(q)}" placeholder="Bijvoorbeeld tintelingen, benauwdheid of duizeligheid"><button>${icon('search')} Zoeken</button></div></form><div class="filter-heading"><strong>Thema's</strong>${label ? `<a href="${escapeHtml(pageUrl({ q, perPage }))}">Wis selectie</a>` : ''}</div><div class="labels">${labels}</div></section><section class="stories-index" aria-labelledby="stories-title"><div class="section-heading stories-heading"><div><p class="eyebrow">Ervaringen uit het archief</p><h2 id="stories-title">${resultTitle}</h2></div><p>${formatNumber(totalPosts)} ${totalPosts === 1 ? 'verhaal' : 'verhalen'}</p></div><div class="grid" data-post-grid data-page="${page}" data-per-page="${perPage}" data-total="${totalPosts}">${visiblePosts.length ? visiblePosts.map(post => postCard(post, { backPath: pageUrl({ q, label, page, perPage }) })).join('') : '<p class="empty">Hier zijn nog geen verhalen voor gevonden. Probeer een ander woord of thema.</p>'}</div></section>${pagination}${burnoutInsightCta()}`;
    return send(res, layout(pageTitle, content, { admin: isAdmin(req), description, canonicalPath: homepageCanonicalPath({ q, label, page: perPage === POSTS_PER_PAGE ? page : Math.floor(((page - 1) * perPage) / POSTS_PER_PAGE) + 1 }), siteUrl: getSiteUrl(req), robots: q || !totalPosts || perPage !== POSTS_PER_PAGE ? 'noindex, follow' : 'index, follow', structuredData: homepageStructuredData(visiblePosts, req) }));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/read$/.test(pathname)) {
    const parts = pathname.split('/');
    const id = decodeURIComponent(parts[2] || '');
    const post = req.admin ? allPosts().find(post => post.id === id) : recordPostRead(id);
    return send(res, JSON.stringify({ ok: Boolean(post) }), post ? 200 : 404, 'application/json; charset=utf-8');
  }
  if (method === 'GET' && /^\/posts\/[^/]+\/?$/.test(pathname)) {
    if (pathname.endsWith('/')) return redirect(res, pathname.slice(0, -1) + req.urlObj.search, 308);
    const id = decodeURIComponent(pathname.split('/').pop()); const archive = allPosts(); const post = archive.find(item => item.id === id);
    if (!post) return send(res, layout('Niet gevonden', '<p class="empty">Dit verhaal bestaat niet.</p>', { admin: isAdmin(req), canonicalPath: pathname, siteUrl: getSiteUrl(req), robots: 'noindex, follow' }), 404);
    const content = `<div class="story-layout"><article class="story"${isAdmin(req) ? '' : ` data-post-id="${escapeHtml(post.id)}"`}><header class="story-heading"><a class="back-link" href="${escapeHtml(backToArchive(req.urlObj.searchParams.get('from')))}">${icon('left')} ${req.urlObj.searchParams.has('from') ? 'Terug naar je selectie' : 'Terug naar alle verhalen'}</a><p class="eyebrow story-author">${escapeHtml(post.author)}</p><h1>${escapeHtml(post.title)}</h1><div class="reader-settings"><label for="reading-size">Tekstgrootte</label><select id="reading-size" data-reading-size><option value="normal">Standaard</option><option value="large">Groter</option><option value="extra">Extra groot</option></select><label for="reading-width">Leesbreedte</label><select id="reading-width" data-reading-width><option value="wide">Ruim</option><option value="focused">Smaller</option></select></div>${storyActions(post, getSiteUrl(req))}</header><div class="story-content${(post.replies || []).length ? ' has-replies' : ''}"><div class="body">${renderText(post.body)}</div>${renderReplies(post, { admin: isAdmin(req) })}</div>${isAdmin(req) ? `<p><a class="button" href="/admin/edit/${encodeURIComponent(post.id)}">Bewerken</a></p>${adminReplyForm(post)}` : ''}</article>${storySidebar(post, archive)}</div>`;
    return send(res, layout(post.title, content, { admin: isAdmin(req), description: toSeoDescription(post.body, post.title), canonicalPath: `/posts/${encodeURIComponent(post.id)}`, type: 'article', siteUrl: getSiteUrl(req), structuredData: postStructuredData(post, req), post }));
  }

  if (method === 'POST' && /^\/admin\/read-metrics\/[^/]+\/purge$/.test(pathname)) {
    if (requireAdmin(req,res)) return;
    const [, , , postId] = pathname.split('/').map(decodeURIComponent);
    if (!allPosts().some(post => post.id === postId)) return send(res, 'Niet gevonden', 404);
    purgePostRead(postId);
    return redirect(res, '/admin');
  }
  if (method === 'GET' && pathname === '/login') return send(res, layout('Login', loginPage(), loginPageOptions(req)));
  if (method === 'POST' && pathname === '/login') {
    const key = auth.loginKey(req);
    // Upload admission and deadlines are independent of password-verification slots.
    const body = await readLoginBody(req, key);
    const retry = auth.beginLogin(key);
    if (retry) {
      res.setHeader('Retry-After', String(retry));
      return send(res, layout('Login', loginPage(`Wacht ${retry} seconden voordat je opnieuw probeert in te loggen.`), loginPageOptions(req)), 429);
    }
    try {
      const admin = getAdmin();
      const valid = Boolean(admin && admin.username === body.username && await verifyPasswordAsync(body.password || '', admin));
      const lock = auth.endLogin(key, valid);
      if (!valid) {
        if (lock) res.setHeader('Retry-After', String(lock));
        const message = lock ? 'Te veel mislukte pogingen. Wacht 60 seconden voordat je het opnieuw probeert.' : 'Inloggen mislukt. Controleer je gebruikersnaam en wachtwoord.';
        return send(res, layout('Login', loginPage(message), loginPageOptions(req)), lock ? 429 : 401);
      }
      res.writeHead(302, { Location: '/admin', 'Set-Cookie': auth.createSession(req) });
      return res.end();
    } finally { auth.cancelLogin(key); }
  }
  if (method === 'POST' && pathname === '/logout') {
    res.writeHead(302, { Location: '/', 'Set-Cookie': auth.logout(req) });
    return res.end();
  }
  if (method === 'GET' && pathname === '/admin/export') {
    if (requireAdmin(req, res)) return;
    res.setHeader('Content-Disposition', `attachment; filename="hyperpedia-archive-v${APP_VERSION}.json"`);
    return send(res, JSON.stringify({ schemaVersion: 1, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), posts: allPosts() }, null, 2), 200, 'application/json; charset=utf-8');
  }
  if (method === 'GET' && pathname === '/admin') { if (requireAdmin(req,res)) return; return send(res, layout('Beheer', adminDashboard(), { admin: true, robots: 'noindex, nofollow' })); }
  if (method === 'POST' && pathname === '/admin/posts') {
    if (requireAdmin(req, res)) return;
    const body = await collect(req);
    const posts = allPosts();
    const id = crypto.randomBytes(6).toString('base64url');
    const timestamp = new Date().toISOString();
    posts.push({ id, author: body.author.trim(), title: body.title.trim(), body: body.body, labels: parseLabels(body.labels), replies: [], created_at: timestamp, updated_at: timestamp });
    savePosts(posts);
    return redirect(res, `/posts/${id}`);
  }

  if (method === 'GET' && /^\/admin\/reply\/[^/]+\/[^/]+\/edit$/.test(pathname)) {
    if (requireAdmin(req,res)) return;
    const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
    const p = allPosts().find(x=>x.id===postId);
    const reply = p?.replies?.find(x=>x.id===replyId);
    if (!p || !reply) return send(res, 'Niet gevonden', 404);
    return send(res, layout('Reactie bewerken', `<section class="panel"><h1>Reactie bewerken</h1><form method="post" action="/admin/reply/${encodeURIComponent(p.id)}/${encodeURIComponent(reply.id)}/edit" class="stack"><input type="hidden" name="revision" value="${postRevision(p)}"><label>Naam originele replier<input name="originalReplier" value="${escapeHtml(reply.originalReplier || p.author)}" required></label><label>Naam beheerder<input name="author" value="${escapeHtml(reply.author || 'Beheerder')}" required></label><label>Reactie<textarea name="body" rows="6" required>${escapeHtml(reply.body)}</textarea></label><div class="form-actions"><button>Reactie bijwerken</button><a class="button secondary" href="/posts/${encodeURIComponent(p.id)}">Annuleren</a></div></form></section>`, { admin: true, robots: 'noindex, nofollow' }));
  }
  if (method === 'POST' && /^\/admin\/reply\/[^/]+\/[^/]+\/edit$/.test(pathname)) {
    if (requireAdmin(req,res)) return;
    const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
    const body = await collect(req);
    const posts = allPosts();
    const p = posts.find(x=>x.id===postId);
    const reply = p?.replies?.find(x=>x.id===replyId);
    if (!p || !reply) return send(res, 'Niet gevonden', 404);
    if (body.revision && body.revision !== postRevision(p)) return editConflict(req, res, body, postId, replyId);
    Object.assign(reply, { originalReplier: body.originalReplier, author: body.author, body: body.body, updated_at: new Date().toISOString() });
    p.updated_at = new Date().toISOString();
    savePosts(posts);
    return redirect(res, `/posts/${postId}`);
  }
  if (method === 'POST' && /^\/admin\/reply\/[^/]+\/[^/]+\/delete$/.test(pathname)) {
    if (requireAdmin(req,res)) return;
    const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
    const posts = allPosts();
    const p = posts.find(x=>x.id===postId);
    if (!p) return send(res, 'Niet gevonden', 404);
    const originalLength = (p.replies || []).length;
    p.replies = (p.replies || []).filter(reply => reply.id !== replyId);
    if (p.replies.length === originalLength) return send(res, 'Niet gevonden', 404);
    p.updated_at = new Date().toISOString();
    savePosts(posts);
    return redirect(res, `/posts/${postId}`);
  }
  if (method === 'POST' && /^\/admin\/reply\/[^/]+$/.test(pathname)) {
    if (requireAdmin(req, res)) return;
    const id = decodeURIComponent(pathname.split('/').pop());
    const body = await collect(req);
    const posts = allPosts();
    const post = posts.find(item => item.id === id);
    if (!post) return send(res, 'Niet gevonden', 404);
    const timestamp = new Date().toISOString();
    post.replies.push({ id: crypto.randomBytes(6).toString('base64url'), originalReplier: (body.originalReplier || post.author).trim(), author: body.author.trim(), body: body.body, created_at: timestamp });
    post.updated_at = timestamp;
    savePosts(posts);
    return redirect(res, `/posts/${encodeURIComponent(id)}`);
  }
  if (method === 'GET' && /^\/admin\/edit\/[^/]+$/.test(pathname)) { if (requireAdmin(req,res)) return; const id = decodeURIComponent(pathname.split('/').pop()); const p = allPosts().find(x=>x.id===id); if (!p) return send(res, 'Niet gevonden', 404); return send(res, layout('Bewerken', adminPostForm(p), { admin: true, robots: 'noindex, nofollow' })); }
  if (method === 'POST' && /^\/admin\/edit\/[^/]+$/.test(pathname)) {
    if (requireAdmin(req, res)) return;
    const id = decodeURIComponent(pathname.split('/').pop());
    const body = await collect(req);
    const posts = allPosts();
    const post = posts.find(item => item.id === id);
    if (!post) return send(res, 'Niet gevonden', 404);
    if (body.revision && body.revision !== postRevision(post)) return editConflict(req, res, body, id);
    Object.assign(post, { author: body.author.trim(), title: body.title.trim(), body: body.body, labels: parseLabels(body.labels), updated_at: new Date().toISOString() });
    savePosts(posts);
    return redirect(res, `/posts/${encodeURIComponent(id)}`);
  }
  res.setHeader('X-Robots-Tag', 'noindex');
  send(res, layout('Niet gevonden', '<section class="panel"><h1>Pagina niet gevonden</h1><p>Deze pagina bestaat niet.</p><a href="/">Terug naar alle verhalen</a></section>', { siteUrl: getSiteUrl(req), robots: 'noindex, follow', canonicalPath: pathname }), 404);
}

const server = http.createServer((req, res) => {
  handler(req, res).catch(error => {
    const status = error instanceof URIError ? 400 : error.status || 500;
    if (status === 500) console.error('Request failed:', error);
    if (res.headersSent) return res.end();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (error.closeConnection) {
      res.setHeader('Connection', 'close');
      res.shouldKeepAlive = false;
    }
    if (status === 429) res.setHeader('Retry-After', '1');
    send(res, status === 500 ? 'Er ging iets mis. Probeer het later opnieuw.' : status === 400 ? 'Ongeldig verzoek.' : error.message, status, 'text/plain; charset=utf-8');
  });
});
if (require.main === module) {
  const PORT = process.env.PORT || 8080;
  const HOST = process.env.HOST || '0.0.0.0';

  server.listen(PORT, HOST, () => {
    console.log(`Hyperpedia v${APP_VERSION} listening on ${HOST}:${PORT}`);
  });
}
module.exports = { server, handler };
