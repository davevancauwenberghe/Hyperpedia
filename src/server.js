const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isoDate: toIsoDate, sitemapDocuments } = require('./seo');
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const { allPosts, savePosts, recordPostRead, purgePostRead, getStats, getAdmin, verifyPassword } = require('./store');
const sessionSecret = getSessionSecret();
const POSTS_PER_PAGE = 18;
const STORIES_OF_THE_DAY_COUNT = 4;
const LOGIN_MAX_FAILURES = 2;
const LOGIN_LOCK_MS = 60_000;
const LOGIN_ATTEMPT_TTL_MS = 15 * 60_000;
const LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS = 60_000;
const loginAttempts = new Map();
let lastLoginAttemptCleanup = 0;

function getSessionSecret() {
  const configuredSecret = process.env.SESSION_SECRET;
  if (configuredSecret && configuredSecret.length >= 32) return configuredSecret;

  const generatedSecret = crypto.randomBytes(48).toString('base64url');
  const reason = configuredSecret
    ? 'SESSION_SECRET is shorter than 32 characters'
    : 'SESSION_SECRET is not set';
  console.warn(`${reason}; using an ephemeral session secret. Set SESSION_SECRET to keep admin sessions valid across restarts.`);
  return generatedSecret;
}
const sessions = new Map();

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
  <script src="/theme.js"></script>
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
  <link rel="stylesheet" href="/style.css">
  ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
  <a class="skip-link" href="#main-content">Ga naar de inhoud</a>
  <header class="site-header">
    <a class="brand" href="/"><span>Hyperpedia</span><small>verhalen die geruststellen</small></a>
    <nav aria-label="Hoofdnavigatie">
      ${admin ? '<a href="/admin">Beheer</a><form method="post" action="/logout"><button>Uitloggen</button></form>' : '<a class="nav-button" href="/login" rel="nofollow">Beheer</a>'}
      <button class="theme-toggle" type="button" aria-label="Donker thema gebruiken" aria-pressed="false"><span aria-hidden="true" data-theme-icon>☾</span></button>
    </nav>
  </header>
  <main id="main-content" tabindex="-1">
    ${error ? `<p class="flash error">${escapeHtml(error)}</p>` : ''}
    ${notice ? `<p class="flash notice">${escapeHtml(notice)}</p>` : ''}
    ${content}
  </main>
  <footer class="site-footer"><div class="footer-note"><strong>Goed om te weten</strong><p>De verhalen op Hyperpedia zijn persoonlijke ervaringen, geen medisch advies. Bespreek nieuwe, ernstige of aanhoudende klachten altijd met je zorgverlener.</p></div><button class="footer-info-link" type="button" data-info-open>Over dit archief</button></footer>
  <dialog class="info-dialog" aria-labelledby="info-dialog-title" data-info-dialog>
    <div class="info-dialog-card">
      <button class="info-dialog-close" type="button" aria-label="Sluit meer informatie" data-info-close>×</button>
      <p class="eyebrow">Waarom Hyperpedia?</p>
      <h2 id="info-dialog-title">Een archief voor (h)erkenning</h2>
      <p>Hyperpedia is opgezet om oudere berichten uit de voormalige fora Angstfobietherapie en Therapiepsycholoog te archiveren en toegankelijk te houden, mocht die informatie ooit verdwijnen.</p>
      <p>Omdat beide fora gesloten zijn voor nieuwe posts en reacties, blijft Hyperpedia bewust een leesarchief. Het doel is herkenning en context bieden, zonder dat het verandert in geruststelling zoeken of medisch advies.</p>
      <div class="info-dialog-actions"><button type="button" data-info-close>Ik begrijp het</button></div>
    </div>
  </dialog>
  <script src="/app.js"></script>
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
function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function dayNumber(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
}
function storiesOfTheDay(posts, date = new Date()) {
  if (posts.length <= STORIES_OF_THE_DAY_COUNT) return posts;
  const ordered = [...posts].sort((a, b) => String(a.id).localeCompare(String(b.id), 'nl'));
  const start = dayNumber(getLocalDateKey(date)) % ordered.length;
  return Array.from({ length: STORIES_OF_THE_DAY_COUNT }, (_, index) => ordered[(start + index) % ordered.length]);
}
function renderStoriesOfTheDay(posts) {
  if (!posts.length) return '';
  const slides = posts.map((post, index) => `<div class="daily-story-slide${index === 0 ? ' is-active' : ''}" id="daily-story-${index + 1}" role="group" aria-roledescription="slide" aria-label="Verhaal ${index + 1} van ${posts.length}"${index === 0 ? '' : ' hidden aria-hidden="true"'}>${postCard(post)}</div>`).join('');
  const dots = posts.map((_, index) => `<button type="button" class="daily-story-dot${index === 0 ? ' is-active' : ''}" aria-label="Toon verhaal ${index + 1}" aria-controls="daily-story-${index + 1}"${index === 0 ? ' aria-current="true"' : ''}></button>`).join('');
  if (posts.length === 1) return `<div class="daily-story-frame"><div class="daily-story-track">${slides}</div></div>`;
  return `<div class="daily-story-frame" data-daily-stories><div class="daily-story-track" aria-live="polite">${slides}</div><div class="daily-story-controls"><button type="button" class="daily-story-arrow" data-daily-prev aria-label="Vorig verhaal">←</button><div class="daily-story-dots" aria-label="Verhalen van de dag navigatie">${dots}</div><button type="button" class="daily-story-arrow" data-daily-next aria-label="Volgend verhaal">→</button></div></div>`;
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
function sign(value) { return crypto.createHmac('sha256', sessionSecret).update(value).digest('hex'); }
function parseCookies(header = '') { return Object.fromEntries(header.split(';').map(v => v.trim().split('=')).filter(v => v[0]).map(([k,...r]) => { try { return [k, decodeURIComponent(r.join('='))]; } catch { return [k, '']; } })); }
function redirect(res, to, code = 302) { res.writeHead(code, { Location: to }); res.end(); }
function send(res, html, code = 200, type = 'text/html; charset=utf-8') { res.writeHead(code, { 'Content-Type': type }); res.end(html); }
async function collect(req) {
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        if (!exceeded) { exceeded = true; chunks.length = 0; reject(Object.assign(new Error('Formulier is te groot.'), { status: 413 })); }
      } else chunks.push(chunk);
    });
    req.on('end', () => { if (!exceeded) resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))); });
    req.on('error', reject);
    req.on('aborted', () => reject(Object.assign(new Error('Verzoek afgebroken.'), { status: 400 })));
  });
  if (req.urlObj.pathname.startsWith('/admin/')) {
    const fields = req.urlObj.pathname.startsWith('/admin/reply/') ? ['author', 'body'] : ['author', 'title', 'body'];
    if (fields.some(key => !body[key]?.trim()) || (body.title || '').length > 300 || (body.author || '').length > 200 || (body.labels || '').length > 2000) {
      throw Object.assign(new Error('Vul een titel, auteur en tekst in; houd titel en auteur kort.'), { status: 400 });
    }
  }
  return body;
}
function parseLabels(value) { return [...new Set(String(value || '').split(',').map(v => v.trim()).filter(Boolean))].slice(0, 12); }
function postCard(post) {
  const labels = post.labels || [];
  return `<article class="card"><div class="card-top"><p class="eyebrow">${escapeHtml(post.author)}</p>${labels.map(l => `<a class="label" href="/?label=${encodeURIComponent(l)}">${escapeHtml(l)}</a>`).join('')}</div><h2><a href="/posts/${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.body.slice(0, 230))}${post.body.length > 230 ? '…' : ''}</p><div class="card-actions"><a class="button secondary" href="/posts/${encodeURIComponent(post.id)}" aria-label="Lees verder: ${escapeHtml(post.title)}">Lees verder</a>${(post.replies || []).length ? `<span class="reply-count">${post.replies.length} reactie${post.replies.length === 1 ? '' : 's'}</span>` : ''}</div></article>`;
}

function pageUrl({ q = '', label = '', page = 1 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (label) params.set('label', label);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/${query ? `?${query}` : ''}`;
}
function homepageCanonicalPath({ q = '', label = '', page = 1 } = {}) {
  return q ? '/' : pageUrl({ label, page });
}
function renderPagination({ q = '', label = '', page = 1, totalPages = 1, totalPosts = 0 } = {}) {
  if (totalPages <= 1) return '';

  const firstVisiblePage = Math.min(Math.max(page - 1, 1), Math.max(totalPages - 2, 1));
  const pages = Array.from({ length: Math.min(3, totalPages) }, (_, index) => firstVisiblePage + index);
  const pageOptions = Array.from({ length: totalPages }, (_, index) => index + 1).map(number => `<option value="${escapeHtml(pageUrl({ q, label, page: number }))}"${number === page ? ' selected' : ''}>Pagina ${number} van ${totalPages}</option>`).join('');
  return `<nav class="pagination" aria-label="Forum posts pagina's"><label class="page-picker"><span class="visually-hidden">Ga naar pagina</span><select data-page-select aria-label="Pagina ${page} van ${totalPages}; selecteer een pagina">${pageOptions}</select><span>· ${formatNumber(totalPosts)} verhalen</span></label><div><a class="button secondary${page === 1 ? ' disabled' : ''}" href="${page === 1 ? '#' : pageUrl({ q, label, page: page - 1 })}" aria-label="Vorige pagina"${page === 1 ? ' aria-disabled="true" tabindex="-1"' : ''}>← Vorige</a>${pages.map(number => number === page ? `<span class="page-current" aria-current="page">${number}</span>` : `<a class="page-link" href="${pageUrl({ q, label, page: number })}">${number}</a>`).join('')}<a class="button secondary${page === totalPages ? ' disabled' : ''}" href="${page === totalPages ? '#' : pageUrl({ q, label, page: page + 1 })}" aria-label="Volgende pagina"${page === totalPages ? ' aria-disabled="true" tabindex="-1"' : ''}>Volgende →</a></div></nav>`;
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
function loginKey(req) {
  return String(req.headers['fly-client-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function getLoginAttempt(key, now = Date.now()) {
  if (now - lastLoginAttemptCleanup >= LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS) {
    for (const [attemptKey, attempt] of loginAttempts) {
      if (attempt.expiresAt <= now || (attempt.lockedUntil && attempt.lockedUntil <= now)) loginAttempts.delete(attemptKey);
    }
    lastLoginAttemptCleanup = now;
  }

  const attempt = loginAttempts.get(key);
  if (attempt && (attempt.expiresAt <= now || (attempt.lockedUntil && attempt.lockedUntil <= now))) {
    loginAttempts.delete(key);
    return undefined;
  }
  return attempt;
}
function renderReplies(post, { admin = false } = {}) {
  const replies = post.replies || [];
  if (!replies.length) return '';

  return `<section class="replies" aria-labelledby="replies-title"><h2 id="replies-title">Reacties</h2>${replies.map(reply => `<article class="reply"><p class="eyebrow">Reactie op ${escapeHtml(reply.originalReplier || post.author)}</p><h3>${escapeHtml(reply.author || 'Beheerder')}</h3><div>${escapeHtml(reply.body).replace(/\n/g, '<br>')}</div>${admin ? `<div class="reply-actions"><a class="button secondary" href="/admin/reply/${encodeURIComponent(post.id)}/${encodeURIComponent(reply.id)}/edit">Reactie bewerken</a><form method="post" action="/admin/reply/${encodeURIComponent(post.id)}/${encodeURIComponent(reply.id)}/delete"><button class="danger" type="submit">Reactie verwijderen</button></form></div>` : ''}</article>`).join('')}</section>`;
}

function formatNumber(value) { return new Intl.NumberFormat('nl-NL').format(value); }
function adminDashboard() {
  const stats = getStats();
  const topReadCount = Math.max(1, ...stats.postReads.map(post => post.read_count));
  const topReadPosts = stats.postReads.slice(0, 5);
  const readRows = topReadPosts.map(post => `<li><div><a href="/posts/${encodeURIComponent(post.id)}">${escapeHtml(post.title)}</a></div><meter min="0" max="${topReadCount}" value="${post.read_count}"></meter><strong>${formatNumber(post.read_count)}</strong><form method="post" action="/admin/read-metrics/${encodeURIComponent(post.id)}/purge"><button class="danger" type="submit">Purge</button></form></li>`).join('');
  return `<section class="admin-overview"><div><p class="eyebrow">Beheerder portal</p><h1>Overzicht</h1><p>Volg in één oogopslag hoeveel verhalen zijn ingevoerd, gelezen en beantwoord.</p></div><div class="stats-grid"><article><span>${formatNumber(stats.readCount)}</span><p>Gelezen posts</p></article><article><span>${formatNumber(stats.postCount)}</span><p>Ingevoerde posts</p></article><article><span>${formatNumber(stats.replyCount)}</span><p>Reacties</p></article></div></section><section class="panel metrics-panel"><div class="section-heading"><p class="eyebrow">Leesstatistieken</p><h2>Reads per post</h2><p>Een handig overzicht van welke vijf verhalen het vaakst zijn geopend.</p></div><ol class="read-metrics">${readRows || '<li class="empty">Nog geen verhalen om te meten.</li>'}</ol></section>`;
}
function adminReplyForm(post) {
  return `<section class="panel reply-panel"><h2>Reactie toevoegen</h2><form method="post" action="/admin/reply/${encodeURIComponent(post.id)}" class="stack"><label>Naam originele replier<input name="originalReplier" value="${escapeHtml(post.author)}" required></label><label>Naam beheerder<input name="author" value="Beheerder" required></label><label>Reactie<textarea name="body" rows="6" required placeholder="Schrijf hier je reactie…"></textarea></label><button>Reactie opslaan</button></form></section>`;
}
function withRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const [sid, sig] = String(cookies.hyperpedia_session || '').split('.');
  for (const [key, expires] of sessions) if (expires <= Date.now()) sessions.delete(key);
  req.sessionId = sid;
  req.admin = Boolean(sid && sig === sign(sid) && sessions.get(sid) > Date.now());
  req.urlObj = new URL(req.url, 'http://localhost');
}

async function handler(req, res) {
  withRequest(req);
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const pathname = req.urlObj.pathname;
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
  const assets = { '/theme.js': 'application/javascript', '/favicon.svg': 'image/svg+xml', '/favicon.ico': 'image/x-icon', '/favicon-48.png': 'image/png', '/apple-touch-icon.png': 'image/png', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png', '/social-preview.png': 'image/png' };
  if (method === 'GET' && assets[pathname]) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return send(res, fs.readFileSync(path.join(__dirname, '..', 'public', pathname.slice(1))), 200, assets[pathname]);
  }
  if (pathname === '/style.css') return send(res, fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css')), 200, 'text/css');
  if (pathname === '/app.js') return send(res, fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js')), 200, 'application/javascript');
  if (pathname === '/site.webmanifest') return send(res, fs.readFileSync(path.join(__dirname, '..', 'public', 'site.webmanifest')), 200, 'application/manifest+json; charset=utf-8');
  if (pathname === '/social-preview.svg') return send(res, fs.readFileSync(path.join(__dirname, '..', 'public', 'social-preview.svg')), 200, 'image/svg+xml; charset=utf-8');
  if (method === 'GET' && pathname === '/robots.txt') return send(res, `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', getSiteUrl(req)).toString()}\n`, 200, 'text/plain; charset=utf-8');
  if (method === 'GET' && (pathname === '/sitemap.xml' || /^\/sitemaps\/[1-9]\d*\.xml$/.test(pathname))) {
    const sitemap = sitemapDocuments(allPosts(), getSiteUrl(req), POSTS_PER_PAGE);
    const xml = pathname === '/sitemap.xml' ? sitemap.root : sitemap.documents[Number(pathname.match(/\d+/)[0]) - 1];
    return send(res, xml || 'Niet gevonden', xml ? 200 : 404, xml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
  }
  if (method === 'GET' && pathname === '/') {
    if (req.urlObj.searchParams.has('perPage')) {
      req.urlObj.searchParams.delete('perPage');
      return redirect(res, `${pathname}${req.urlObj.search}`, 308);
    }
    const q = (req.urlObj.searchParams.get('q') || '').trim();
    const label = (req.urlObj.searchParams.get('label') || '').trim();
    let posts = allPosts().sort((a,b)=>a.title.localeCompare(b.title,'nl'));
    if (q) posts = posts.filter(p => {
      const replyText = (p.replies || []).map(reply => `${reply.originalReplier || ''} ${reply.author || ''} ${reply.body || ''}`).join(' ');
      return `${p.title} ${p.author} ${p.body} ${(p.labels||[]).join(' ')} ${replyText}`.toLowerCase().includes(q.toLowerCase());
    });
    if (label) posts = posts.filter(p => (p.labels || []).includes(label));
    const requestedPage = Number.parseInt(req.urlObj.searchParams.get('page') || '1', 10);
    const totalPosts = posts.length;
    const totalPages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));
    const page = Math.min(Math.max(Number.isNaN(requestedPage) ? 1 : requestedPage, 1), totalPages);
    const normalizedPath = pageUrl({ q, label, page });
    if (req.urlObj.searchParams.has('page') && req.urlObj.searchParams.get('page') !== String(page)) return redirect(res, normalizedPath, 308);
    if (req.urlObj.searchParams.get('page') === '1') return redirect(res, normalizedPath, 308);
    const visiblePosts = posts.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);
    const allLabels = [...new Set(allPosts().flatMap(p => p.labels || []))].sort((a,b)=>a.localeCompare(b,'nl'));
    const pagination = renderPagination({ q, label, page, totalPages, totalPosts });
    const dailyStories = storiesOfTheDay(allPosts());
    const resultTitle = q ? `Zoekresultaten voor “${escapeHtml(q)}”` : label ? `Verhalen over ${escapeHtml(label)}` : 'Alle verhalen';
    const pageTitle = `${q ? `Zoeken naar ${q}` : label ? `Verhalen over ${label}` : 'Ervaringen over hyperventilatie en overprikkeling'}${page > 1 ? ` – pagina ${page}` : ''}`;
    const description = label ? `Lees herkenbare ervaringen over ${label}, stress, ademhaling en lichamelijke sensaties op Hyperpedia.` : undefined;
    const labels = allLabels.map(l => { const selected = l === label; return `<a class="label${selected ? ' selected' : ''}" href="${selected ? pageUrl({ q }) : pageUrl({ q, label: l })}"${selected ? ' aria-current="true"' : ''}>${escapeHtml(l)}</a>`; }).join('');
    const content = `<section class="hero home-hero"><div class="hero-copy"><p class="eyebrow">Een rustig leesarchief</p><h1>Herkenning voor onrustige momenten</h1><p>Lees op je eigen tempo ervaringen over stress, ademhaling en vreemde lichamelijke sensaties. Soms helpt het al om te merken dat je niet de enige bent.</p><div class="calm-note"><strong>Rustig lezen, zonder account</strong><span>Je hoeft niets te plaatsen of bij te houden. Kies alleen wat op dit moment prettig voelt.</span></div></div><section class="daily-stories" aria-labelledby="daily-stories-title"><div class="section-heading"><p class="eyebrow">Een verhaal voor vandaag</p><h2 id="daily-stories-title">Misschien herken je iets</h2></div>${renderStoriesOfTheDay(dailyStories)}</section></section><section class="toolbar" aria-labelledby="find-stories-title"><div class="section-heading"><p class="eyebrow">Vind herkenning</p><h2 id="find-stories-title">Waar wil je over lezen?</h2></div><form class="search-form" role="search">${label ? `<input type="hidden" name="label" value="${escapeHtml(label)}">` : ''}<label for="story-search">Zoek in alle verhalen en reacties</label><div class="search-controls"><input id="story-search" name="q" value="${escapeHtml(q)}" placeholder="Bijvoorbeeld tintelingen, benauwdheid of duizeligheid"><button>Zoeken</button></div></form><div class="filter-heading"><strong>Thema's</strong>${label ? `<a href="${escapeHtml(pageUrl({ q }))}">Wis selectie</a>` : ''}</div><div class="labels">${labels}</div></section><section class="stories-index" aria-labelledby="stories-title"><div class="section-heading stories-heading"><div><p class="eyebrow">Ervaringen uit het archief</p><h2 id="stories-title">${resultTitle}</h2></div><p>${formatNumber(totalPosts)} ${totalPosts === 1 ? 'verhaal' : 'verhalen'}</p></div><div class="grid" data-post-grid>${visiblePosts.length ? visiblePosts.map(postCard).join('') : '<p class="empty">Hier zijn nog geen verhalen voor gevonden. Probeer een ander woord of thema.</p>'}</div></section>${pagination}${burnoutInsightCta()}`;
    return send(res, layout(pageTitle, content, { admin: isAdmin(req), description, canonicalPath: homepageCanonicalPath({ q, label, page }), siteUrl: getSiteUrl(req), robots: q || !totalPosts ? 'noindex, follow' : 'index, follow', structuredData: homepageStructuredData(visiblePosts, req) }));
  }
  if (method === 'POST' && /^\/posts\/[^/]+\/read$/.test(pathname)) {
    const parts = pathname.split('/');
    const id = decodeURIComponent(parts[2] || '');
    const post = recordPostRead(id);
    return send(res, JSON.stringify({ ok: Boolean(post) }), post ? 200 : 404, 'application/json; charset=utf-8');
  }
  if (method === 'GET' && /^\/posts\/[^/]+\/?$/.test(pathname)) {
    if (pathname.endsWith('/')) return redirect(res, pathname.slice(0, -1), 308);
    const id = decodeURIComponent(pathname.split('/').pop()); const post = allPosts().find(item => item.id === id);
    if (!post) return send(res, layout('Niet gevonden', '<p class="empty">Dit verhaal bestaat niet.</p>', { admin: isAdmin(req), canonicalPath: pathname, siteUrl: getSiteUrl(req), robots: 'noindex, follow' }), 404);
    return send(res, layout(post.title, `${isAdmin(req) ? '<article class="story">' : `<article class="story" data-post-id="${escapeHtml(post.id)}">`}<a class="back-link" href="/">← Terug naar alle verhalen</a><p class="eyebrow story-author">${escapeHtml(post.author)}</p><h1>${escapeHtml(post.title)}</h1><div class="labels">${(post.labels||[]).map(l=>`<a class="label" href="/?label=${encodeURIComponent(l)}">${escapeHtml(l)}</a>`).join('')}</div><div class="body">${escapeHtml(post.body).replace(/\n/g, '<br>')}</div>${renderReplies(post, { admin: isAdmin(req) })}${isAdmin(req) ? `<p><a class="button" href="/admin/edit/${encodeURIComponent(post.id)}">Bewerken</a></p>${adminReplyForm(post)}` : ''}</article>`, { admin: isAdmin(req), description: toSeoDescription(post.body, post.title), canonicalPath: `/posts/${encodeURIComponent(post.id)}`, type: 'article', siteUrl: getSiteUrl(req), structuredData: postStructuredData(post, req), post }));
  }

  if (method === 'POST' && pathname.startsWith('/admin/read-metrics/') && pathname.endsWith('/purge')) {
    if (requireAdmin(req,res)) return;
    const [, , , postId] = pathname.split('/').map(decodeURIComponent);
    purgePostRead(postId);
    return redirect(res, '/admin');
  }
  if (method === 'GET' && pathname === '/login') return send(res, layout('Login', loginPage(), loginPageOptions(req)));
  if (method === 'POST' && pathname === '/login') {
    const key = loginKey(req);
    const now = Date.now();
    const attempt = getLoginAttempt(key, now);
    if (attempt?.lockedUntil > now) {
      const seconds = Math.ceil((attempt.lockedUntil - now) / 1000);
      res.setHeader('Retry-After', String(seconds));
      return send(res, layout('Login', loginPage(`Te veel mislukte pogingen. Probeer het over ${seconds} seconden opnieuw.`), loginPageOptions(req)), 429);
    }
    const body = await collect(req);
    const admin = getAdmin();
    if (!admin || admin.username !== body.username || !verifyPassword(body.password || '', admin)) {
      const failures = (attempt?.failures || 0) + 1;
      const lockedUntil = failures >= LOGIN_MAX_FAILURES ? now + LOGIN_LOCK_MS : 0;
      loginAttempts.set(key, { failures, lockedUntil, expiresAt: now + LOGIN_ATTEMPT_TTL_MS });
      if (lockedUntil) res.setHeader('Retry-After', '60');
      const message = lockedUntil ? 'Te veel mislukte pogingen. Wacht 60 seconden voordat je het opnieuw probeert.' : 'Inloggen mislukt. Controleer je gebruikersnaam en wachtwoord.';
      return send(res, layout('Login', loginPage(message), loginPageOptions(req)), lockedUntil ? 429 : 401);
    }
    loginAttempts.delete(key);
    const sid = crypto.randomBytes(32).toString('hex'); sessions.set(sid, Date.now() + SESSION_TTL); res.writeHead(302, { Location: '/admin', 'Set-Cookie': `hyperpedia_session=${sid}.${sign(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` }); return res.end();
  }
  if (method === 'POST' && pathname === '/logout') { sessions.delete(req.sessionId); res.writeHead(302, { Location: '/', 'Set-Cookie': 'hyperpedia_session=; Path=/; Max-Age=0' }); return res.end(); }
  if (method === 'GET' && pathname === '/admin') { if (requireAdmin(req,res)) return; return send(res, layout('Beheer', `${adminDashboard()}<section class="panel admin-form-panel"><h1>Nieuw verhaal toevoegen</h1><form method="post" action="/admin/posts" class="stack"><label>Titel<input name="title" required></label><label>Naam oorspronkelijke auteur<input name="author" required></label><label>Labels <small>komma-gescheiden</small><input name="labels" placeholder="ademhaling, duizeligheid, geruststelling"></label><label>Forumtekst<textarea name="body" rows="14" required></textarea></label><button>Opslaan</button></form></section>`, { admin: true, robots: 'noindex, nofollow' })); }
  if (method === 'POST' && pathname === '/admin/posts') { if (requireAdmin(req,res)) return; const body = await collect(req); const posts = allPosts(); const id = crypto.randomBytes(6).toString('base64url'); posts.push({ id, author: body.author, title: body.title, body: body.body, labels: parseLabels(body.labels), replies: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); savePosts(posts); return redirect(res, `/posts/${id}`); }

  if (method === 'GET' && pathname.startsWith('/admin/reply/') && pathname.endsWith('/edit')) {
    if (requireAdmin(req,res)) return;
    const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
    const p = allPosts().find(x=>x.id===postId);
    const reply = p?.replies?.find(x=>x.id===replyId);
    if (!p || !reply) return send(res, 'Niet gevonden', 404);
    return send(res, layout('Reactie bewerken', `<section class="panel"><h1>Reactie bewerken</h1><form method="post" action="/admin/reply/${encodeURIComponent(p.id)}/${encodeURIComponent(reply.id)}/edit" class="stack"><label>Naam originele replier<input name="originalReplier" value="${escapeHtml(reply.originalReplier || p.author)}" required></label><label>Naam beheerder<input name="author" value="${escapeHtml(reply.author || 'Beheerder')}" required></label><label>Reactie<textarea name="body" rows="6" required>${escapeHtml(reply.body)}</textarea></label><div class="form-actions"><button>Reactie bijwerken</button><a class="button secondary" href="/posts/${encodeURIComponent(p.id)}">Annuleren</a></div></form></section>`, { admin: true, robots: 'noindex, nofollow' }));
  }
  if (method === 'POST' && pathname.startsWith('/admin/reply/') && pathname.endsWith('/edit')) {
    if (requireAdmin(req,res)) return;
    const [, , , postId, replyId] = pathname.split('/').map(decodeURIComponent);
    const body = await collect(req);
    const posts = allPosts();
    const p = posts.find(x=>x.id===postId);
    const reply = p?.replies?.find(x=>x.id===replyId);
    if (!p || !reply) return send(res, 'Niet gevonden', 404);
    Object.assign(reply, { originalReplier: body.originalReplier, author: body.author, body: body.body, updated_at: new Date().toISOString() });
    p.updated_at = new Date().toISOString();
    savePosts(posts);
    return redirect(res, `/posts/${postId}`);
  }
  if (method === 'POST' && pathname.startsWith('/admin/reply/') && pathname.endsWith('/delete')) {
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
  if (method === 'POST' && pathname.startsWith('/admin/reply/')) { if (requireAdmin(req,res)) return; const id = decodeURIComponent(pathname.split('/').pop()); const body = await collect(req); const posts = allPosts(); const p = posts.find(x=>x.id===id); if (!p) return send(res, 'Niet gevonden', 404); p.replies = p.replies || []; p.replies.push({ id: crypto.randomBytes(6).toString('base64url'), originalReplier: body.originalReplier, author: body.author, body: body.body, created_at: new Date().toISOString() }); p.updated_at = new Date().toISOString(); savePosts(posts); return redirect(res, `/posts/${id}`); }
  if (method === 'GET' && pathname.startsWith('/admin/edit/')) { if (requireAdmin(req,res)) return; const id = decodeURIComponent(pathname.split('/').pop()); const p = allPosts().find(x=>x.id===id); if (!p) return send(res, 'Niet gevonden', 404); return send(res, layout('Bewerken', `<section class="panel"><h1>Verhaal bewerken</h1><form method="post" action="/admin/edit/${encodeURIComponent(p.id)}" class="stack"><label>Titel<input name="title" value="${escapeHtml(p.title)}" required></label><label>Naam oorspronkelijke auteur<input name="author" value="${escapeHtml(p.author)}" required></label><label>Labels<input name="labels" value="${escapeHtml((p.labels||[]).join(', '))}"></label><label>Forumtekst<textarea name="body" rows="14" required>${escapeHtml(p.body)}</textarea></label><button>Bijwerken</button></form></section>`, { admin: true, robots: 'noindex, nofollow' })); }
  if (method === 'POST' && pathname.startsWith('/admin/edit/')) { if (requireAdmin(req,res)) return; const id = decodeURIComponent(pathname.split('/').pop()); const body = await collect(req); const posts = allPosts(); const p = posts.find(x=>x.id===id); if (!p) return send(res, 'Niet gevonden', 404); Object.assign(p, { author: body.author, title: body.title, body: body.body, labels: parseLabels(body.labels), updated_at: new Date().toISOString() }); savePosts(posts); return redirect(res, `/posts/${id}`); }
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
    send(res, status === 500 ? 'Er ging iets mis. Probeer het later opnieuw.' : status === 400 ? 'Ongeldig verzoek.' : error.message, status, 'text/plain; charset=utf-8');
  });
});
if (require.main === module) {
  const PORT = process.env.PORT || 8080;
  const HOST = process.env.HOST || '0.0.0.0';

  server.listen(PORT, HOST, () => {
    console.log(`Listening on ${HOST}:${PORT}`);
  });
}
module.exports = { server, handler };
