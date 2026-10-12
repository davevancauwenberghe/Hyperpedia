// Responsive page sizes use the actual CSS columns, keeping six complete rows.
(() => {
  let grid = document.querySelector('[data-post-grid]');
  if (!grid) return;
  const section = () => grid.closest('.stories-index');
  const status = document.createElement('p');
  status.className = 'archive-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  section().before(status);
  let pending;
  let activeNavigation = null;
  let generation = 0;
  let resizeTimer;
  let initialized = false;
  let readingAnchor = null;
  let resizing = false;
  const sizeForWidth = () =>
    Math.min(
      6,
      Math.max(
        1,
        getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean)
          .length,
      ),
    ) * 6;
  const scrollTo = (element) => {
    if (!element) return;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    element.scrollIntoView({ block: 'start', behavior: 'auto' });
    root.style.scrollBehavior = previous;
  };
  const recordPosition = () => {
    if (
      window.scrollY + 200 < section().offsetTop ||
      grid.getBoundingClientRect().bottom <= 100
    ) {
      readingAnchor = null;
      return;
    }
    readingAnchor =
      [...grid.querySelectorAll('[data-story-id]')].find(
        (card) => card.getBoundingClientRect().bottom > 100,
      )?.dataset.storyId || null;
  };
  async function load(
    target = window.location.href,
    { navigation = false, pop = false } = {},
  ) {
    const desired = sizeForWidth();
    if (!navigation && !pop && activeNavigation) {
      // Resizing must retain a page choice that is still loading.
      if (desired === activeNavigation.size) {
        resizing = false;
        return;
      }
      target = activeNavigation.target;
      ({ navigation, pop } = activeNavigation);
    }
    const url = new URL(target, window.location.origin);
    const oldSize =
      navigation || pop
        ? Number(url.searchParams.get('perPage') || 18)
        : Number(grid.dataset.perPage);
    const oldPage =
      navigation || pop
        ? Number(url.searchParams.get('page') || 1)
        : Number(grid.dataset.page);
    const total = Number(grid.dataset.total);
    const cards = [...grid.querySelectorAll('[data-story-id]')];
    const visible = cards.findIndex(
      (card) => card.dataset.storyId === readingAnchor,
    );
    const preserve = initialized && !navigation && !pop && visible >= 0;
    const offset =
      (oldPage - 1) * oldSize + (preserve ? Math.max(0, visible) : 0);
    const page = Math.min(
      Math.floor(offset / desired) + 1,
      Math.max(1, Math.ceil(total / desired)),
    );
    if (!navigation && !pop && desired === Number(grid.dataset.perPage)) {
      // A previous resize response may still be in flight after returning to this width.
      ++generation;
      pending?.abort();
      pending = undefined;
      grid.removeAttribute('aria-busy');
      initialized = true;
      resizing = false;
      status.textContent = '';
      recordPosition();
      return;
    }
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    if (desired !== 18) url.searchParams.set('perPage', String(desired));
    else url.searchParams.delete('perPage');
    const anchor = preserve
      ? cards[Math.max(0, visible)]?.dataset.storyId
      : null;
    const current = ++generation;
    pending?.abort();
    pending = new AbortController();
    activeNavigation =
      navigation || pop ? { target, navigation, pop, size: desired } : null;
    grid.setAttribute('aria-busy', 'true');
    status.textContent = 'Verhalen laden…';
    try {
      const response = await fetch(url, {
        signal: pending.signal,
        headers: { Accept: 'text/html' },
      });
      if (!response.ok) throw new Error('Loading failed');
      const html = new DOMParser().parseFromString(
        await response.text(),
        'text/html',
      );
      if (current !== generation) return;
      const replacement = html.querySelector('.stories-index');
      if (!replacement?.querySelector('[data-post-grid]'))
        throw new Error('Missing archive');
      const pagination = html.querySelector('.pagination');
      document.querySelector('.pagination')?.remove();
      section().replaceWith(document.importNode(replacement, true));
      grid = document.querySelector('[data-post-grid]');
      if (pagination) section().after(document.importNode(pagination, true));
      const finalUrl = new URL(response.url);
      if (navigation)
        history.pushState(null, '', finalUrl.pathname + finalUrl.search);
      else history.replaceState(null, '', finalUrl.pathname + finalUrl.search);
      // Metadata stays server-rendered: personal size variants are noindex on direct requests.
      status.textContent = '';
      if (navigation) scrollTo(section());
      else if (anchor)
        scrollTo(
          [...grid.querySelectorAll('[data-story-id]')].find(
            (card) => card.dataset.storyId === anchor,
          ),
        );
    } catch (error) {
      if (current === generation && error.name !== 'AbortError')
        status.textContent =
          'Meer verhalen laden lukt momenteel niet. Je huidige pagina blijft beschikbaar.';
    } finally {
      if (current === generation) {
        pending = undefined;
        activeNavigation = null;
        initialized = true;
        resizing = false;
        grid.removeAttribute('aria-busy');
        recordPosition();
      }
    }
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest('.pagination a');
    if (
      !link ||
      link.getAttribute('aria-disabled') === 'true' ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    load(link.href, { navigation: true });
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-page-select]'))
      load(event.target.value, { navigation: true });
  });
  window.addEventListener('popstate', () =>
    load(window.location.href, { pop: true }),
  );
  window.addEventListener(
    'scroll',
    () => {
      if (!resizing) recordPosition();
    },
    { passive: true },
  );
  window.addEventListener('resize', () => {
    resizing = true;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => load(), 250);
  });
  load();
})();
