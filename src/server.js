const http = require('node:http');
const { isoDate: toIsoDate, sitemapDocuments } = require('./seo');
const { version: APP_VERSION } = require('../package.json');
const { icon } = require('./icons');
const { escapeHtml, previewText } = require('./html');
const { layout } = require('./layout');
const { getSiteUrl, redirectToCanonicalOrigin } = require('./origin');
const { send, redirect } = require('./http');
const { securityHeaders } = require('./security');
const { serveAsset } = require('./assets');
const { createAdminRoutes } = require('./admin-routes');
const { adminReplyForm, formatNumber, postRevision } = require('./admin-ui');
const { createReadTracking } = require('./read-tracking');
const { attributionPath, authorData, replyKey, replyAnchor, replyHref } = require('./reading');
const readingUi = require('./reading-ui');
const { privacyPage } = require('./privacy');
const { robotsText, llmsText } = require('./discovery');
const { createReadingPages, availablePaths } = require('./reading-pages');
const { createAuth } = require('./auth');
const { createLoginBodyReader } = require('./forms');
const { searchPosts, storiesOfTheDay, pageSize, archiveIndex } = require('./archive');
const store = require('./store');
const { allPosts, getPost, flushReadMetrics, startReadMetricsFlusher, stopReadMetricsFlusher } =
  store;
const auth = createAuth();
const readLoginBody = createLoginBodyReader();
const POSTS_PER_PAGE = 18;

function toSeoDescription(value, fallback) {
  const compact = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return compact ? previewText(compact, 155) : fallback;
}
function renderStoriesOfTheDay(posts) {
  if (!posts.length) return '';
  const slides = posts
    .map(
      (post, index) =>
        `<div class="daily-story-slide${index === 0 ? ' is-active' : ''}" id="daily-story-${index + 1}" role="group" aria-roledescription="slide" aria-label="Verhaal ${index + 1} van ${posts.length}"${index === 0 ? '' : ' hidden aria-hidden="true"'}>${postCard(post)}</div>`,
    )
    .join('');
  const dots = posts
    .map(
      (_, index) =>
        `<button type="button" class="daily-story-dot${index === 0 ? ' is-active' : ''}" aria-label="Toon verhaal ${index + 1}" aria-controls="daily-story-${index + 1}"${index === 0 ? ' aria-current="true"' : ''}></button>`,
    )
    .join('');
  if (posts.length === 1)
    return `<div class="daily-story-frame"><div class="daily-story-track">${slides}</div></div>`;
  return `<div class="daily-story-frame" data-daily-stories><div class="daily-story-track" aria-live="polite">${slides}</div><div class="daily-story-controls"><button type="button" class="daily-story-arrow" data-daily-prev aria-label="Vorig verhaal">${icon('left')}</button><div class="daily-story-dots" aria-label="Verhalen van de dag navigatie">${dots}</div><button type="button" class="daily-story-arrow" data-daily-next aria-label="Volgend verhaal">${icon('right')}</button></div></div>`;
}
function homepageStructuredData(posts, req) {
  const siteUrl = getSiteUrl(req);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Hyperpedia',
    url: siteUrl,
    description:
      'Een rustige encyclopedie met herkenbare forumverhalen over lichamelijke stresssignalen.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
    mainEntity: {
      '@type': 'ItemList',
      name: 'Verhalen uit het Hyperpedia-archief',
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: post.title,
        url: new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).href,
      })),
    },
  };
}
function postStructuredData(post, req) {
  const siteUrl = getSiteUrl(req);
  return {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: post.title,
    text: post.body,
    author: authorData(post.author, attributionPath(post), siteUrl),
    datePublished: toIsoDate(post.created_at),
    dateModified: toIsoDate(post.updated_at) || toIsoDate(post.created_at),
    inLanguage: 'nl',
    commentCount: (post.replies || []).length,
    comment: (post.replies || []).map((reply, index) => ({
      '@type': 'Comment',
      text: reply.body,
      author: authorData(reply.author || 'Beheerder', attributionPath(post, reply, index), siteUrl),
      datePublished: toIsoDate(reply.created_at),
      dateModified: toIsoDate(reply.updated_at),
      url: new URL(replyHref(post, replyKey(reply, index)), siteUrl).href,
    })),
    mainEntityOfPage: new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).href,
    keywords: (post.labels || []).join(', '),
    url: new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).toString(),
  };
}

function isAdmin(req) {
  return Boolean(req.admin);
}
function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    redirect(res, '/login');
    return true;
  }
  return false;
}
function postCard(post, { backPath = '' } = {}) {
  const url = `/posts/${encodeURIComponent(post.id)}${backPath && backPath !== '/' ? `?from=${encodeURIComponent(backPath)}` : ''}`;
  const labels = post.labels || [];
  return `<article class="card" data-story-id="${escapeHtml(post.id)}"><div class="card-top"><p class="eyebrow">${escapeHtml(post.author)}</p>${labels.map((l) => `<a class="label" href="/?label=${encodeURIComponent(l)}">${escapeHtml(l)}</a>`).join('')}</div><h2><a href="${escapeHtml(url)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(previewText(post.body, 230))}</p><div class="card-actions"><a class="button secondary" href="${escapeHtml(url)}" aria-label="Lees verder: ${escapeHtml(post.title)}">Lees verder</a>${(post.replies || []).length ? `<span class="reply-count">${post.replies.length} reactie${post.replies.length === 1 ? '' : 's'}</span>` : ''}</div></article>`;
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
function renderPagination({
  q = '',
  label = '',
  page = 1,
  totalPages = 1,
  totalPosts = 0,
  perPage = POSTS_PER_PAGE,
} = {}) {
  const first = Math.min(Math.max(page - 1, 1), Math.max(totalPages - 2, 1));
  const pages = Array.from({ length: Math.min(3, totalPages) }, (_, index) => first + index);
  const pageOptions = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map(
      (number) =>
        `<option value="${number}"${number === page ? ' selected' : ''}>Pagina ${number} van ${totalPages}</option>`,
    )
    .join('');
  return `<nav class="pagination" aria-label="Verhalenpagina's"${totalPages <= 1 ? ' hidden' : ''}><form class="page-picker" method="get" action="/" data-page-picker>${q ? `<input type="hidden" name="q" value="${escapeHtml(q)}">` : ''}${label ? `<input type="hidden" name="label" value="${escapeHtml(label)}">` : ''}<input type="hidden" name="perPage" value="${perPage}"><label><span class="visually-hidden">Ga naar pagina</span><select data-page-select name="page" aria-label="Pagina ${page} van ${totalPages}; kies een pagina en druk op Ga">${pageOptions}</select></label><button class="secondary" type="submit">Ga</button><span>· ${formatNumber(totalPosts)} verhalen</span></form><div data-page-links><a data-page-prev class="button secondary${page === 1 ? ' disabled' : ''}" href="${page === 1 ? '#' : pageUrl({ q, label, page: page - 1, perPage })}" aria-label="Vorige pagina"${page === 1 ? ' aria-disabled="true" tabindex="-1"' : ''}>${icon('left')} Vorige</a>${pages.map((number) => (number === page ? `<span class="page-current" aria-current="page">${number}</span>` : `<a class="page-link" href="${pageUrl({ q, label, page: number, perPage })}">${number}</a>`)).join('')}<a data-page-next class="button secondary${page === totalPages ? ' disabled' : ''}" href="${page === totalPages ? '#' : pageUrl({ q, label, page: page + 1, perPage })}" aria-label="Volgende pagina"${page === totalPages ? ' aria-disabled="true" tabindex="-1"' : ''}>Volgende ${icon('right')}</a></div></nav>`;
}

function burnoutInsightCta() {
  return `<section class="external-forum-cta" aria-labelledby="burnout-insight-title"><div><p class="eyebrow">Nieuwe vragen stellen</p><h2 id="burnout-insight-title">Zoek je een actieve plek om verder te praten?</h2><p>Hyperpedia bewaart oudere forumverhalen als archief. Wil je zelf anoniem delen, reageren op anderen of herkenning vinden bij mensen die nu hetzelfde meemaken? Bezoek dan het forum van Burnout Insight en kom in contact met lotgenoten.</p></div><a class="button" href="https://www.burnoutinsight.com" target="_blank" rel="noopener noreferrer">Naar Burnout Insight</a></section>`;
}

function renderText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
function renderReplies(post, { admin = false } = {}) {
  const replies = post.replies || [];
  if (!replies.length) return '';
  const replyIds = new Map();
  for (const reply of replies)
    replyIds.set(String(reply.id), (replyIds.get(String(reply.id)) || 0) + 1);

  return `<section class="replies" aria-labelledby="replies-title"><h2 id="replies-title">Reacties</h2>${replies.map((reply, index) => `<article class="reply" id="${escapeHtml(replyAnchor(replyKey(reply, index)))}"><p class="eyebrow">Reactie op ${escapeHtml(reply.originalReplier || post.author)}</p><h3><a class="author-link" href="${attributionPath(post, reply, index)}">${escapeHtml(reply.author || 'Beheerder')}</a></h3><div>${renderText(reply.body)}</div>${admin && typeof reply.id === 'string' && reply.id && replyIds.get(String(reply.id)) === 1 ? `<div class="reply-actions"><a class="button secondary" href="/admin/reply/${encodeURIComponent(post.id)}/${encodeURIComponent(reply.id)}/edit">Reactie bewerken</a><form method="post" action="/admin/reply/${encodeURIComponent(post.id)}/${encodeURIComponent(reply.id)}/delete"><input type="hidden" name="revision" value="${postRevision(post)}"><button class="danger" type="submit">Reactie verwijderen</button></form></div>` : ''}</article>`).join('')}</section>`;
}

function storySidebar(post, archive) {
  const labels = new Set(post.labels || []);
  const related = archive
    .filter((item) => item.id !== post.id)
    .map((item) => ({
      item,
      overlap: (item.labels || []).filter((label) => labels.has(label)).length,
    }))
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.item.title.localeCompare(b.item.title, 'nl'))
    .slice(0, 3)
    .map(({ item }) => item);
  return `<aside class="story-sidebar" id="related-stories" aria-label="Verder in het archief">${labels.size ? `<section class="sidebar-panel"><p class="eyebrow">In dit verhaal</p><h2>Thema's</h2><div class="labels">${[...labels].map((label) => `<a class="label" href="/?label=${encodeURIComponent(label)}">${escapeHtml(label)}</a>`).join('')}</div></section>` : ''}${related.length ? `<section class="sidebar-panel related-stories"><p class="eyebrow">Verder lezen</p><h2>Misschien herken je dit ook</h2>${related.map((item) => `<a class="related-story" href="/posts/${encodeURIComponent(item.id)}"><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.author)}</small><span class="related-arrow">${icon('external')}</span></a>`).join('')}</section>` : ''}<a class="sidebar-back" href="/">Bekijk alle verhalen ${icon('right')}</a></aside>`;
}

function withRequest(req) {
  auth.authenticate(req);
  req.urlObj = new URL(req.url, 'http://localhost');
}
function backToArchive(value) {
  if (typeof value !== 'string' || !value.startsWith('/?') || value.length > 2000) return '/';
  const params = new URL(value, 'http://localhost').searchParams;
  const number = Number(params.get('page') || '1');
  return pageUrl({
    q: (params.get('q') || '').trim().slice(0, 300),
    label: (params.get('label') || '').trim().slice(0, 200),
    page: Number.isSafeInteger(number) && number > 0 ? number : 1,
    perPage: pageSize(params.get('perPage')),
  });
}
function storyActions(post, siteUrl) {
  const url = new URL(`/posts/${encodeURIComponent(post.id)}`, siteUrl).href;
  return `<div class="reader-actions" data-story-actions hidden>${readingUi.storyTools(post)}<button class="secondary" type="button" data-story-share>${icon('share')} Delen</button><button class="secondary" type="button" data-story-copy>${icon('copy')} Link kopiëren</button><button class="secondary" type="button" data-story-print>${icon('print')} Afdrukken</button><input class="share-url" aria-label="Link naar dit verhaal" value="${escapeHtml(url)}" readonly data-share-url hidden><p class="action-feedback" role="status" aria-live="polite" data-action-status data-reading-status></p></div>`;
}

const handleReadingPages = createReadingPages({
  layout,
  send,
  redirect,
  requireAdmin,
  getSiteUrl,
  isAdmin,
  store,
});
const handleAdminRoutes = createAdminRoutes({ store, auth, readLoginBody, requireAdmin });
const handleReadTracking = createReadTracking({
  store,
  clientKey: auth.loginKey,
  getSiteUrl,
  send,
});

async function handler(req, res) {
  securityHeaders(res);
  withRequest(req);
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const pathname = req.urlObj.pathname;
  if (method === 'GET' && pathname === '/healthz') {
    res.setHeader('Cache-Control', 'no-store');
    return send(res, 'ok\n', 200, 'text/plain; charset=utf-8');
  }
  if (redirectToCanonicalOrigin(req, res)) return;
  res.setHeader('Cache-Control', 'no-cache');
  if (
    pathname.startsWith('/admin') ||
    pathname === '/login' ||
    pathname === '/logout' ||
    req.admin
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
  }
  if (pathname.startsWith('/admin') || pathname === '/login' || pathname === '/logout')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (
    method === 'POST' &&
    (req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin && req.headers.origin !== new URL(getSiteUrl(req)).origin))
  ) {
    return send(res, 'Dit formulier komt van een andere website.', 403);
  }
  if (!['GET', 'POST'].includes(method)) {
    res.setHeader('Allow', 'GET, HEAD, POST');
    return send(res, 'Methode niet toegestaan', 405);
  }
  if (serveAsset(req, res)) return;
  if (method === 'GET' && pathname === '/privacy')
    return send(
      res,
      layout('Privacy & opslag', privacyPage(), {
        canonicalPath: '/privacy',
        siteUrl: getSiteUrl(req),
        admin: isAdmin(req),
        robots: 'noindex, follow',
      }),
    );
  if (await handleReadingPages(req, res, method)) return;
  if (await handleAdminRoutes(req, res, method)) return;
  if (handleReadTracking(req, res)) return;
  if (method === 'GET' && pathname === '/robots.txt')
    return send(res, robotsText(getSiteUrl(req)), 200, 'text/plain; charset=utf-8');
  if (method === 'GET' && pathname === '/llms.txt') {
    const posts = allPosts();
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    return send(
      res,
      llmsText(posts, availablePaths(posts), getSiteUrl(req)),
      200,
      'text/plain; charset=utf-8',
    );
  }
  if (
    method === 'GET' &&
    (pathname === '/sitemap.xml' || /^\/sitemaps\/[1-9]\d*\.xml$/.test(pathname))
  ) {
    const archive = allPosts();
    const sitemap = sitemapDocuments(archive, getSiteUrl(req), POSTS_PER_PAGE, [
      '/leesroutes',
      ...availablePaths(archive).map((route) => readingUi.pathUrl(route)),
    ]);
    const xml =
      pathname === '/sitemap.xml'
        ? sitemap.root
        : sitemap.documents[Number(pathname.match(/\d+/)[0]) - 1];
    return send(
      res,
      xml || 'Niet gevonden',
      xml ? 200 : 404,
      xml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
    );
  }
  if (method === 'GET' && pathname === '/') {
    const perPage = pageSize(req.urlObj.searchParams.get('perPage'));
    if (
      req.urlObj.searchParams.has('perPage') &&
      (perPage === POSTS_PER_PAGE || String(perPage) !== req.urlObj.searchParams.get('perPage'))
    ) {
      req.urlObj.searchParams.delete('perPage');
      return redirect(res, `${pathname}${req.urlObj.search}`, 308);
    }
    const q = (req.urlObj.searchParams.get('q') || '').trim().slice(0, 300);
    const label = (req.urlObj.searchParams.get('label') || '').trim().slice(0, 200);
    const archive = allPosts();
    let posts = searchPosts(archive, q);
    if (label) posts = posts.filter((p) => (p.labels || []).includes(label));
    const requestedPage = Number.parseInt(req.urlObj.searchParams.get('page') || '1', 10);
    const totalPosts = posts.length;
    const totalPages = Math.max(1, Math.ceil(totalPosts / perPage));
    const page = Math.min(Math.max(Number.isNaN(requestedPage) ? 1 : requestedPage, 1), totalPages);
    const normalizedPath = pageUrl({ q, label, page, perPage });
    if (req.urlObj.searchParams.has('page') && req.urlObj.searchParams.get('page') !== String(page))
      return redirect(res, normalizedPath, 308);
    if (req.urlObj.searchParams.get('page') === '1') return redirect(res, normalizedPath, 308);
    const visiblePosts = posts.slice((page - 1) * perPage, page * perPage);
    const allLabels = archiveIndex(archive).labels;
    const pagination = renderPagination({ q, label, page, totalPages, totalPosts, perPage });
    const reserve = `<template data-archive-reserve data-offset="${(page - 1) * perPage + visiblePosts.length}">${posts
      .slice((page - 1) * perPage + visiblePosts.length, (page - 1) * perPage + 36)
      .map((post) => postCard(post))
      .join('')}</template>`;
    const dailyStories = storiesOfTheDay(archive);
    const resultTitle = q
      ? `Zoekresultaten voor “${escapeHtml(q)}”`
      : label
        ? `Verhalen over ${escapeHtml(label)}`
        : 'Alle verhalen';
    const pageTitle = `${q ? `Zoeken naar ${q}` : label ? `Verhalen over ${label}` : 'Ervaringen over hyperventilatie en overprikkeling'}${page > 1 ? ` – pagina ${page}` : ''}`;
    const description = label
      ? `Lees herkenbare ervaringen over ${label}, stress, ademhaling en lichamelijke sensaties op Hyperpedia.`
      : undefined;
    const labels = allLabels
      .map((l) => {
        const selected = l === label;
        return `<a class="label${selected ? ' selected' : ''}" href="${selected ? pageUrl({ q, perPage }) : pageUrl({ q, label: l, perPage })}"${selected ? ' aria-current="true"' : ''}>${escapeHtml(l)}</a>`;
      })
      .join('');
    const content = `<section class="hero home-hero"><div class="hero-copy"><p class="eyebrow">Een rustig leesarchief</p><h1>Herkenning voor onrustige momenten</h1><p>Lees op je eigen tempo ervaringen over stress, ademhaling en vreemde lichamelijke sensaties. Soms helpt het al om te merken dat je niet de enige bent.</p><a class="hero-link" href="#find-stories-title">Ontdek het archief ${icon('external')}</a></div><section class="daily-stories" aria-labelledby="daily-stories-title"><div class="section-heading"><p class="eyebrow">Een verhaal voor vandaag</p><h2 id="daily-stories-title">Misschien herken je iets</h2></div>${renderStoriesOfTheDay(dailyStories)}</section></section><section class="toolbar" aria-labelledby="find-stories-title"><div class="section-heading"><p class="eyebrow">Vind herkenning</p><h2 id="find-stories-title">Waar wil je over lezen?</h2></div><form class="search-form" role="search">${perPage !== POSTS_PER_PAGE ? `<input type="hidden" name="perPage" value="${perPage}">` : ''}${label ? `<input type="hidden" name="label" value="${escapeHtml(label)}">` : ''}<label for="story-search">Zoek in alle verhalen en reacties</label><div class="search-controls"><input id="story-search" name="q" value="${escapeHtml(q)}" placeholder="Bijvoorbeeld tintelingen, benauwdheid of duizeligheid"><button>${icon('search')} Zoeken</button></div></form><div class="filter-heading"><strong>Thema's</strong>${label ? `<a href="${escapeHtml(pageUrl({ q, perPage }))}">Wis selectie</a>` : ''}</div><div class="labels">${labels}</div></section><section class="stories-index" aria-labelledby="stories-title"><div class="section-heading stories-heading"><div><p class="eyebrow">Ervaringen uit het archief</p><h2 id="stories-title">${resultTitle}</h2></div><p>${formatNumber(totalPosts)} ${totalPosts === 1 ? 'verhaal' : 'verhalen'}</p></div><div class="grid" data-post-grid data-page="${page}" data-per-page="${perPage}" data-total="${totalPosts}" data-query="${escapeHtml(q)}" data-label="${escapeHtml(label)}">${visiblePosts.length ? visiblePosts.map((post) => postCard(post, { backPath: pageUrl({ q, label, page, perPage }) })).join('') : '<p class="empty">Hier zijn nog geen verhalen voor gevonden. Probeer een ander woord of thema.</p>'}</div></section>${reserve}${pagination}${readingUi.pathsPreview(availablePaths(archive))}${burnoutInsightCta()}`;
    return send(
      res,
      layout(pageTitle, content, {
        admin: isAdmin(req),
        description,
        canonicalPath: homepageCanonicalPath({
          q,
          label,
          page:
            perPage === POSTS_PER_PAGE
              ? page
              : Math.floor(((page - 1) * perPage) / POSTS_PER_PAGE) + 1,
        }),
        siteUrl: getSiteUrl(req),
        robots:
          q || !totalPosts || perPage !== POSTS_PER_PAGE ? 'noindex, follow' : 'index, follow',
        structuredData: homepageStructuredData(visiblePosts, req),
      }),
    );
  }
  if (method === 'GET' && /^\/posts\/[^/]+\/?$/.test(pathname)) {
    if (pathname.endsWith('/'))
      return redirect(res, pathname.slice(0, -1) + req.urlObj.search, 308);
    const id = decodeURIComponent(pathname.split('/').pop());
    const archive = allPosts();
    const post = getPost(id);
    if (!post)
      return send(
        res,
        layout('Niet gevonden', '<p class="empty">Dit verhaal bestaat niet.</p>', {
          admin: isAdmin(req),
          canonicalPath: pathname,
          siteUrl: getSiteUrl(req),
          robots: 'noindex, follow',
        }),
        404,
      );
    const route = availablePaths(archive).find(
      (route) =>
        route.id === req.urlObj.searchParams.get('route') &&
        route.posts.some((item) => item.id === post.id),
    );
    const backPath = route
      ? readingUi.pathUrl(route)
      : backToArchive(req.urlObj.searchParams.get('from'));
    const content = `<div class="story-layout"><article class="story" data-reader${isAdmin(req) ? '' : ` data-post-id="${escapeHtml(post.id)}"`}><header class="story-heading"><a class="back-link" href="${escapeHtml(backPath)}">${icon('left')} ${route ? 'Terug naar de leesroute' : req.urlObj.searchParams.has('from') ? 'Terug naar je selectie' : 'Terug naar alle verhalen'}</a><p class="eyebrow story-author"><a class="author-link" href="${attributionPath(post)}">${escapeHtml(post.author)}</a></p><h1>${escapeHtml(post.title)}</h1><details class="reading-preferences"><summary>Leesvoorkeuren <span class="focus-summary" data-focus-summary hidden>· focus aan</span>${icon('right')}</summary><div class="reader-options"><div class="reader-settings"><label for="reading-size">Tekstgrootte</label><select id="reading-size" data-reading-size><option value="normal">Standaard</option><option value="large">Groter</option><option value="extra">Extra groot</option></select><label for="reading-width">Leesbreedte</label><select id="reading-width" data-reading-width><option value="wide">Ruim</option><option value="focused">Smaller</option></select></div>${storyActions(post, getSiteUrl(req))}<p class="reader-storage-note">Je leeslijst blijft in deze browser. <a href="/privacy">Opslagvoorkeuren</a></p></div></details></header><div class="story-content${(post.replies || []).length ? ' has-replies' : ''}"><div class="body" id="story-text">${renderText(post.body)}</div>${renderReplies(post, { admin: isAdmin(req) })}</div>${isAdmin(req) ? `<p><a class="button" href="/admin/edit/${encodeURIComponent(post.id)}">Bewerken</a></p>${adminReplyForm(post)}` : ''}${readingUi.pathContext(route, post)}</article>${storySidebar(post, archive)}</div>`;
    return send(
      res,
      layout(post.title, content, {
        admin: isAdmin(req),
        description: toSeoDescription(post.body, post.title),
        canonicalPath: `/posts/${encodeURIComponent(post.id)}`,
        type: 'article',
        siteUrl: getSiteUrl(req),
        structuredData: postStructuredData(post, req),
        post,
      }),
    );
  }

  res.setHeader('X-Robots-Tag', 'noindex');
  send(
    res,
    layout(
      'Niet gevonden',
      '<section class="panel"><h1>Pagina niet gevonden</h1><p>Deze pagina bestaat niet.</p><a href="/">Terug naar alle verhalen</a></section>',
      { siteUrl: getSiteUrl(req), robots: 'noindex, follow', canonicalPath: pathname },
    ),
    404,
  );
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((error) => {
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
    send(
      res,
      status === 500
        ? 'Er ging iets mis. Probeer het later opnieuw.'
        : status === 400
          ? 'Ongeldig verzoek.'
          : error.message,
      status,
      'text/plain; charset=utf-8',
    );
  });
});
let trackingTimer;
server.on('listening', () => {
  startReadMetricsFlusher();
  trackingTimer = setInterval(handleReadTracking.cleanup, 60_000);
  trackingTimer.unref();
});
server.on('close', () => {
  clearInterval(trackingTimer);
  stopReadMetricsFlusher();
  try {
    flushReadMetrics();
  } catch (error) {
    console.error('Could not flush read totals on close:', error.message);
  }
});

if (require.main === module) {
  require('./lifecycle').installLifecycle(server, store);
  const PORT = Number(process.env.PORT || 8080);
  if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535)
    throw new Error('PORT must be a valid TCP port.');
  const HOST = process.env.HOST || '0.0.0.0';

  server.listen(PORT, HOST, () => {
    console.log(`Hyperpedia v${APP_VERSION} listening on ${HOST}:${server.address().port}`);
  });
}
module.exports = { server, handler };
