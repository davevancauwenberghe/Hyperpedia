const { isoDate: toIsoDate } = require('./seo');
const { version: APP_VERSION } = require('../package.json');
const { icon } = require('./icons');
const { escapeHtml } = require('./html');
const { getSiteUrl } = require('./origin');
const { assetUrl } = require('./assets');

const layout = (
  title,
  content,
  {
    admin = false,
    error = '',
    notice = '',
    description = 'Hyperpedia verzamelt herkenbare verhalen over hyperventilatie, stress en lichamelijke sensaties.',
    canonicalPath = '/',
    siteUrl = getSiteUrl(),
    type = 'website',
    robots = 'index, follow',
    structuredData = null,
    post = null,
  } = {},
) => {
  const socialImage = new URL(assetUrl('social-preview.png'), siteUrl).href;
  const robotDirectives =
    robots === 'index, follow' ? `${robots}, max-image-preview:large` : robots;
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
  <script src="${assetUrl('storage.js')}"></script>
  <script src="${assetUrl('theme.js')}"></script>
  <link rel="icon" href="${assetUrl('favicon.ico')}" sizes="any">
  <link rel="icon" href="${assetUrl('favicon.svg')}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${assetUrl('apple-touch-icon.png')}" sizes="180x180">
  <meta name="apple-mobile-web-app-title" content="Hyperpedia">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="application-name" content="Hyperpedia">
  <link rel="manifest" href="${assetUrl('site.webmanifest')}">
  <meta name="robots" content="${escapeHtml(robotDirectives)}">
  <link rel="describedby" href="${escapeHtml(new URL('/llms.txt', siteUrl).href)}" type="text/plain">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <meta property="og:locale" content="nl_BE">
  <meta property="og:site_name" content="Hyperpedia">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
${socialImage.startsWith('https:') ? `  <meta property="og:image:secure_url" content="${escapeHtml(socialImage)}">` : ''}
  <meta property="og:image:alt" content="Hyperpedia — verhalen die geruststellen">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${metaDescription}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <meta name="twitter:image:alt" content="Hyperpedia — verhalen die geruststellen">
  ${
    post
      ? [
          ['published_time', toIsoDate(post.created_at)],
          ['modified_time', toIsoDate(post.updated_at)],
        ]
          .filter(([, value]) => value)
          .map(([key, value]) => `<meta property="article:${key}" content="${value}">`)
          .join('\n')
      : ''
  }
  <meta name="twitter:card" content="summary_large_image">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="${assetUrl('style.css')}">
  ${structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body>
  <a class="skip-link" href="#main-content">Ga naar de inhoud</a>
  <header class="site-header">
    <a class="brand" href="/"><img class="brand-mark" src="${assetUrl('favicon.svg')}" width="44" height="44" alt=""><span class="brand-copy"><span class="brand-title">Hyperpedia</span><small>verhalen die geruststellen</small></span></a>
    <nav aria-label="Hoofdnavigatie"><a class="nav-button public-nav-link" href="/leesroutes">${icon('route')}<span>Leesroutes</span></a><a class="nav-button public-nav-link" href="/leeslijst">${icon('bookmark')}<span>Mijn leeslijst</span></a>
      ${admin ? '<a class="nav-button" href="/admin">Overzicht</a><form method="post" action="/logout"><button>Uitloggen</button></form>' : ''}
      <button class="theme-toggle" type="button" aria-label="Donker thema gebruiken" aria-pressed="false">${icon('moon')}${icon('sun')}</button>
    </nav>
  </header>
  <main id="main-content" tabindex="-1">
    ${error ? `<p class="flash error">${escapeHtml(error)}</p>` : ''}
    ${notice ? `<p class="flash notice">${escapeHtml(notice)}</p>` : ''}
    ${content}
  </main>
  <aside class="consent-banner" aria-label="Privacykeuze" data-consent-banner hidden><p><strong>Jouw privacykeuze</strong> Hyperpedia kan je leesvoorkeuren onthouden en anonieme verhaaltellingen bijhouden. Je keuze geldt één jaar. Lezen en bewaren werkt altijd. Wijzigen kan via Privacy &amp; opslag.</p><div class="consent-actions"><button class="secondary" type="button" data-consent-reject>Weigeren</button><button class="secondary" type="button" data-consent-accept>Alles toestaan</button><a href="/privacy">Instellingen</a></div></aside>
  <footer class="site-footer"><div class="footer-note"><strong>Goed om te weten</strong><p>De verhalen op Hyperpedia zijn persoonlijke ervaringen, geen medisch advies. Bespreek nieuwe, ernstige of aanhoudende klachten altijd met je zorgverlener.</p></div><div class="footer-actions"><button class="footer-info-link" type="button" data-info-open>Over dit archief</button><a class="footer-info-link" href="/privacy">Privacy &amp; opslag</a><span class="site-version">v${APP_VERSION}</span></div></footer>
  <dialog class="info-dialog" aria-labelledby="info-dialog-title" data-info-dialog>
    <div class="info-dialog-card">
      <button class="info-dialog-close" type="button" aria-label="Sluit meer informatie" data-info-close>${icon('close')}</button>
      <p class="eyebrow">Waarom Hyperpedia?</p>
      <h2 id="info-dialog-title">Een archief voor (h)erkenning</h2>
      <p>Hyperpedia is opgezet om oudere berichten uit de voormalige fora Angstfobietherapie en Therapiepsycholoog te archiveren en toegankelijk te houden, mocht die informatie ooit verdwijnen.</p>
      <p>Omdat beide fora gesloten zijn voor nieuwe posts en reacties, blijft Hyperpedia bewust een leesarchief. Het doel is herkenning en context bieden, zonder dat het verandert in geruststelling zoeken of medisch advies.</p>
      <details class="install-help"><summary>Hyperpedia op je beginscherm ${icon('right')}</summary><p data-install-guide>Op iPhone of iPad: open het deelmenu en kies Voeg toe aan beginscherm. Op Android: kies App installeren of Toevoegen aan startscherm in het browsermenu.</p><p>Een geïnstalleerde webapp kan eigen browseropslag gebruiken. Je leeslijst wordt ook daar niet automatisch gesynchroniseerd.</p><button class="secondary" type="button" data-install-app hidden>Hyperpedia installeren</button><p class="action-feedback" role="status" data-install-status></p></details>
      <div class="info-dialog-actions"><button type="button" data-info-close>Ik begrijp het</button></div>
    </div>
  </dialog>
  <script src="${assetUrl('app.js')}"></script>
  <script src="${assetUrl('reading.js')}"></script>
  <script src="${assetUrl('privacy.js')}"></script>
  <script src="${assetUrl('pwa.js')}" data-worker-url="${assetUrl('sw.js')}"></script>
  <script src="${assetUrl('archive.js')}"></script>
</body>
</html>`;
};

module.exports = { layout };
