const { escapeHtml: e } = require('./html');
const { icon } = require('./icons');
const { replyHref } = require('./reading');
const pathUrl = (route) => `/leesroutes/${encodeURIComponent(route.id)}`;
const storyUrl = (post, route) =>
  `/posts/${encodeURIComponent(post.id)}${route ? `?route=${encodeURIComponent(route.id)}` : ''}`;

function bookmarkButton(post) {
  return `<button class="bookmark-button secondary" type="button" data-bookmark="${e(post.id)}" data-bookmark-title="${e(post.title)}" aria-label="Bewaar ${e(post.title)}" aria-pressed="false" hidden>${icon('bookmark')} <span data-bookmark-label>Bewaren</span></button>`;
}
function libraryPage() {
  return `<section class="reading-page-heading"><p class="eyebrow">Jouw eigen leesplek</p><h1>Mijn leeslijst</h1><p data-library-note>Je leeslijst wordt alleen in deze browser en dit browserprofiel bewaard. Een andere browser op hetzelfde apparaat heeft een eigen lijst; je lijst wordt niet gesynchroniseerd.</p><p>Wis je websitegegevens of sluit je een privévenster, dan kan je lijst verdwijnen. Bewaarde verhalen blijven maximaal één jaar in deze browser staan.</p></section><noscript><p class="panel">Zet JavaScript aan om je persoonlijke leeslijst te gebruiken. Het <a href="/">archief</a> blijft zonder JavaScript leesbaar.</p></noscript><section class="library-section" aria-labelledby="saved-heading"><div class="section-heading"><h2 id="saved-heading" tabindex="-1">Bewaarde verhalen</h2><p data-saved-count></p></div><div class="library-grid" data-saved-list><p class="empty">Je leeslijst laden…</p></div></section><div class="library-actions" data-library-controls hidden><button class="secondary" type="button" data-clear-library>Wis leeslijst</button><p class="action-feedback" role="status" data-library-status></p></div><dialog class="info-dialog" data-clear-dialog aria-labelledby="clear-heading"><div class="info-dialog-card"><h2 id="clear-heading">Je leeslijst wissen?</h2><p>Dit wist alle bewaarde verhalen in deze browser. Je leesvoorkeuren blijven behouden.</p><div class="form-actions"><button class="danger" type="button" data-confirm-clear>Wissen</button><button class="secondary" type="button" data-cancel-clear>Annuleren</button></div></div></dialog>`;
}
function pathCards(routes, limit = routes.length) {
  return routes
    .slice(0, limit)
    .map(
      (route) =>
        `<a class="path-card" href="${pathUrl(route)}"><span class="path-icon">${icon('route')}</span><div><p class="eyebrow">${route.posts.length} verhalen · jouw tempo</p><h3>${e(route.title)}</h3><p>${e(route.description)}</p></div><span class="path-arrow">${icon('right')}</span></a>`,
    )
    .join('');
}
function pathsPreview(routes) {
  if (!routes.length) return '';
  return `<section class="reading-paths-preview" aria-labelledby="paths-heading"><div class="section-heading"><p class="eyebrow">Een beginpunt kiezen</p><h2 id="paths-heading">Leesroutes door het archief</h2><p>Een kleine verzameling verhalen binnen hetzelfde thema.</p></div><div class="path-grid">${pathCards(routes, 3)}</div><a class="quiet-link" href="/leesroutes">Bekijk alle leesroutes ${icon('right')}</a></section>`;
}
function pathsPage(routes) {
  return `<section class="reading-page-heading"><p class="eyebrow">Een beginpunt kiezen</p><h1>Leesroutes</h1><p>Ontdek een kleine verzameling verhalen binnen één thema. Begin waar je wilt en lees op je eigen tempo.</p></section><div class="path-grid">${pathCards(routes) || '<p class="empty">Zodra er meer verhalen binnen een thema zijn, vind je hier leesroutes.</p>'}</div>`;
}
function pathPage(route) {
  return `<section class="reading-page-heading"><a class="back-link" href="/leesroutes">${icon('left')} Alle leesroutes</a><p class="eyebrow">${route.posts.length} verhalen · jouw tempo</p><h1>${e(route.title)}</h1><p>${e(route.description)}</p><a class="button" href="${storyUrl(route.posts[0], route)}">Begin de leesroute ${icon('right')}</a></section><ol class="path-stories">${route.posts.map((post, index) => `<li><span class="path-number">${index + 1}</span><div><p class="eyebrow">${e(post.author)}</p><h2><a href="${storyUrl(post, route)}">${e(post.title)}</a></h2><p>${e(post.body.slice(0, 180))}${post.body.length > 180 ? '…' : ''}</p></div><div class="path-story-actions"><a class="button secondary" href="${storyUrl(post, route)}">Lezen ${icon('right')}</a></div></li>`).join('')}</ol>`;
}
function pathContext(route, post) {
  if (!route) return '';
  const index = route.posts.findIndex((item) => item.id === post.id);
  if (index < 0) return '';
  return `<nav class="path-context" aria-label="Navigatie binnen leesroute"><div><p class="eyebrow">Leesroute · ${index + 1} van ${route.posts.length}</p><a href="${pathUrl(route)}">${e(route.title)}</a></div><div class="path-context-actions">${index ? `<a class="button secondary" href="${storyUrl(route.posts[index - 1], route)}">${icon('left')} Vorig verhaal</a>` : ''}${index + 1 < route.posts.length ? `<a class="button secondary" href="${storyUrl(route.posts[index + 1], route)}">Volgend verhaal ${icon('right')}</a>` : `<a class="button secondary" href="${pathUrl(route)}">${icon('check')} Einde van de route</a>`}</div></nav>`;
}
function storyTools(post) {
  return `${bookmarkButton(post)}<button class="focus-button secondary" type="button" data-focus-toggle aria-pressed="false" hidden>${icon('focus')} <span data-focus-label>Focus</span></button>`;
}
function attributionPage(post, name, reply, replyKey) {
  return `<section class="panel attribution-page"><a class="back-link" href="${e(reply ? replyHref(post, replyKey) : storyUrl(post))}">${icon('left')} Terug naar het verhaal</a><p class="eyebrow">Bronvermelding · ${reply ? 'gearchiveerde reactie' : 'gearchiveerd verhaal'}</p><h1>${e(name)}</h1><p>De naam zoals bewaard bij ${reply ? 'deze reactie' : 'dit verhaal'} in het Hyperpedia-archief.</p><dl class="attribution-details"><div><dt>Bijdrage bij</dt><dd><a href="/posts/${encodeURIComponent(post.id)}">${e(post.title)}</a></dd></div><div><dt>Rol bij deze bijdrage</dt><dd>${reply ? 'Naam bij de reactie' : 'Naam bij het oorspronkelijke verhaal'}</dd></div></dl><p class="attribution-note">Deze bronvermelding hoort bij één archiefbijdrage. Het is geen gebruikersaccount of geverifieerde biografie. Dezelfde weergegeven naam bij andere verhalen hoeft niet dezelfde persoon te zijn.</p></section>`;
}
function pathEditor(routes, posts, definitions, revision, current) {
  const selected = current || {
    id: '',
    title: '',
    description: '',
    postIds: [],
  };
  const options = [...posts].sort((a, b) =>
    a.title.localeCompare(b.title, 'nl'),
  );
  return `<section class="panel"><a class="back-link" href="/admin">${icon('left')} Overzicht</a><h1>Leesroutes beheren</h1><p>Routes binnen bestaande thema's werken automatisch. Kies zelf drie tot vijf verhalen om een selectie en volgorde vast te leggen.</p><div class="labels">${routes.map((route) => `<a class="label" href="/admin/leesroutes?id=${encodeURIComponent(route.id)}">${e(route.title)}${route.automatic ? ' · thema' : ' · eigen selectie'}</a>`).join('')}<a class="label" href="/admin/leesroutes">Nieuwe route</a></div><form class="stack editor-grid" method="post" action="/admin/leesroutes"><input type="hidden" name="revision" value="${revision}"><input type="hidden" name="id" value="${e(selected.id)}"><label class="field-wide">Titel<input name="title" required maxlength="100" value="${e(selected.title)}"></label><label class="field-wide">Omschrijving<textarea name="description" rows="3" maxlength="500">${e(selected.description)}</textarea></label>${Array.from({ length: 5 }, (_, index) => `<label${index === 4 ? ' class="field-wide"' : ''}>Verhaal ${index + 1}${index >= 3 ? ' (optioneel)' : ''}<select name="post${index + 1}"${index < 3 ? ' required' : ''}><option value="">Kies een verhaal</option>${options.map((post) => `<option value="${e(post.id)}"${selected.postIds[index] === post.id ? ' selected' : ''}>${e(post.title)} · ${e(post.author)}</option>`).join('')}</select></label>`).join('')}<div class="form-actions field-wide"><button>Leesroute opslaan</button>${selected.id ? `<a class="button secondary" href="/leesroutes/${encodeURIComponent(selected.id)}">Leesroute bekijken</a>` : ''}</div></form>${definitions.some((route) => route.id === selected.id) ? `<form class="form-actions" method="post" action="/admin/leesroutes/reset"><input type="hidden" name="revision" value="${revision}"><input type="hidden" name="id" value="${e(selected.id)}"><button class="secondary">Handmatige selectie verwijderen</button><p>Een bestaande themaroute gebruikt daarna weer de automatische selectie.</p></form>` : ''}</section>`;
}
module.exports = {
  bookmarkButton,
  libraryPage,
  pathsPreview,
  pathsPage,
  pathPage,
  pathContext,
  storyTools,
  attributionPage,
  pathEditor,
  pathUrl,
};
