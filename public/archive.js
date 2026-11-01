// Six complete rows, adapting the first page from server-rendered reserve cards.
(() => {
  let grid = document.querySelector('[data-post-grid]');
  if (!grid) return;
  const section = () => grid.closest('.stories-index');
  const status = document.createElement('p');
  status.className = 'archive-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  section().before(status);
  let seed;
  function rememberCards(root) {
    const reserve = root.querySelector('[data-archive-reserve]');
    const cards = [...grid.querySelectorAll('[data-story-id]')];
    seed = {
      start: (Number(grid.dataset.page) - 1) * Number(grid.dataset.perPage),
      cards: [...cards, ...(reserve?.content.querySelectorAll('[data-story-id]') || [])].map(
        (card) => card.cloneNode(true),
      ),
    };
    reserve?.remove();
  }
  rememberCards(document);
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
      Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length),
    ) * 6;
  function pageUrl(page, size) {
    const params = new URLSearchParams();
    if (grid.dataset.query) params.set('q', grid.dataset.query);
    if (grid.dataset.label) params.set('label', grid.dataset.label);
    if (page > 1) params.set('page', String(page));
    if (size !== 18) params.set('perPage', String(size));
    return '/' + (params.size ? '?' + params : '');
  }
  function updatePagination(page, size) {
    const nav = document.querySelector('.pagination');
    if (!nav) return;
    const pages = Math.max(1, Math.ceil(Number(grid.dataset.total) / size));
    nav.hidden = pages <= 1;
    const form = nav.querySelector('[data-page-picker]');
    form.elements.perPage.value = size;
    const select = form.querySelector('[data-page-select]');
    select.replaceChildren(
      ...Array.from({ length: pages }, (_, index) => {
        const option = document.createElement('option');
        option.value = String(index + 1);
        option.textContent = `Pagina ${index + 1} van ${pages}`;
        option.selected = index + 1 === page;
        return option;
      }),
    );
    select.setAttribute('aria-label', `Pagina ${page} van ${pages}; kies een pagina en druk op Ga`);
    const previous = nav.querySelector('[data-page-prev]');
    const next = nav.querySelector('[data-page-next]');
    for (const [link, disabled, number] of [
      [previous, page === 1, page - 1],
      [next, page === pages, page + 1],
    ]) {
      link.href = disabled ? '#' : pageUrl(number, size);
      link.classList.toggle('disabled', disabled);
      if (disabled) {
        link.setAttribute('aria-disabled', 'true');
        link.tabIndex = -1;
      } else {
        link.removeAttribute('aria-disabled');
        link.removeAttribute('tabindex');
      }
    }
    const first = Math.min(Math.max(page - 1, 1), Math.max(pages - 2, 1));
    const links = Array.from({ length: Math.min(3, pages) }, (_, index) => {
      const number = first + index;
      const link = document.createElement(number === page ? 'span' : 'a');
      link.textContent = String(number);
      link.className = number === page ? 'page-current' : 'page-link';
      if (number === page) link.setAttribute('aria-current', 'page');
      else link.href = pageUrl(number, size);
      return link;
    });
    nav.querySelector('[data-page-links]').replaceChildren(previous, ...links, next);
  }
  function renderLocal(page, size) {
    const start = (page - 1) * size;
    const end = Math.min(start + size, Number(grid.dataset.total));
    if (start < seed.start || end > seed.start + seed.cards.length) return false;
    const back = pageUrl(page, size);
    const cards = seed.cards.slice(start - seed.start, end - seed.start).map((original) => {
      const card = original.cloneNode(true);
      for (const link of card.querySelectorAll('h2 a, .card-actions > a')) {
        const url = new URL(link.href, location.origin);
        if (back === '/') url.searchParams.delete('from');
        else url.searchParams.set('from', back);
        link.href = url.pathname + url.search;
      }
      return card;
    });
    if (cards.length) grid.replaceChildren(...cards);
    grid.dataset.page = page;
    grid.dataset.perPage = size;
    updatePagination(page, size);
    return true;
  }
  function scrollTo(element) {
    if (!element) return;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    element.scrollIntoView({ block: 'start', behavior: 'auto' });
    root.style.scrollBehavior = previous;
  }
  function recordPosition() {
    if (window.scrollY + 200 < section().offsetTop || grid.getBoundingClientRect().bottom <= 100) {
      readingAnchor = null;
      return;
    }
    readingAnchor =
      [...grid.querySelectorAll('[data-story-id]')].find(
        (card) => card.getBoundingClientRect().bottom > 100,
      )?.dataset.storyId || null;
  }
  async function load(target = window.location.href, { navigation = false, pop = false } = {}) {
    const desired = sizeForWidth();
    if (!navigation && !pop && activeNavigation) {
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
      navigation || pop ? Number(url.searchParams.get('page') || 1) : Number(grid.dataset.page);
    const cards = [...grid.querySelectorAll('[data-story-id]')];
    const visible = cards.findIndex((card) => card.dataset.storyId === readingAnchor);
    const preserve = initialized && !navigation && !pop && visible >= 0;
    const offset = (oldPage - 1) * oldSize + (preserve ? visible : 0);
    const page = Math.min(
      Math.floor(offset / desired) + 1,
      Math.max(1, Math.ceil(Number(grid.dataset.total) / desired)),
    );
    if (!navigation && !pop && initialized && desired === Number(grid.dataset.perPage)) {
      ++generation;
      pending?.abort();
      pending = undefined;
      grid.removeAttribute('aria-busy');
      resizing = false;
      status.textContent = '';
      recordPosition();
      return;
    }
    const anchor = preserve ? cards[visible]?.dataset.storyId : null;
    const current = ++generation;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    activeNavigation = navigation || pop ? { target, navigation, pop, size: desired } : null;
    let timedOut = false;
    let timer;
    const initial = !initialized && !navigation && !pop;
    let finalPath = pageUrl(page, desired);
    try {
      if (!renderLocal(page, desired)) {
        grid.setAttribute('aria-busy', 'true');
        status.textContent = 'Verhalen laden…';
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, 8000);
        const response = await fetch(finalPath, {
          signal: controller.signal,
          headers: { Accept: 'text/html' },
        });
        if (!response.ok) throw new Error('Loading failed');
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (current !== generation) return;
        const replacement = html.querySelector('.stories-index');
        if (!replacement?.querySelector('[data-post-grid]')) throw new Error('Missing archive');
        const pagination = html.querySelector('.pagination');
        document.querySelector('.pagination')?.remove();
        section().replaceWith(document.importNode(replacement, true));
        grid = document.querySelector('[data-post-grid]');
        if (pagination) section().after(document.importNode(pagination, true));
        rememberCards(html);
        const finalUrl = new URL(response.url);
        finalPath = finalUrl.pathname + finalUrl.search;
      }
      if (navigation) history.pushState(null, '', finalPath);
      else if (!initial) history.replaceState(null, '', finalPath);
      status.textContent = '';
      if (navigation) {
        const heading = section().querySelector('h2');
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        scrollTo(section());
      } else if (anchor)
        scrollTo(
          [...grid.querySelectorAll('[data-story-id]')].find(
            (card) => card.dataset.storyId === anchor,
          ),
        );
    } catch (error) {
      if (current === generation && (timedOut || error.name !== 'AbortError'))
        status.textContent =
          'Meer verhalen laden lukt momenteel niet. Je huidige pagina blijft beschikbaar.';
    } finally {
      clearTimeout(timer);
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
  document.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-page-picker]')) return;
    event.preventDefault();
    load(pageUrl(Number(event.target.elements.page.value), Number(grid.dataset.perPage)), {
      navigation: true,
    });
  });
  window.addEventListener('popstate', () => load(window.location.href, { pop: true }));
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
