(() => {
  const key = 'hyperpedia-reading-v1';
  const empty = () => ({ version: 1, saved: [], history: [] });
  const validId = (id) =>
    typeof id === 'string' && id.length > 0 && id.length <= 512;
  const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
  function normalize(value) {
    if (!value || value.version !== 1) return empty();
    const saved = Array.isArray(value.saved) ? value.saved : [];
    const history = Array.isArray(value.history) ? value.history : [];
    const unique = (entries) => [
      ...new Map(entries.map((entry) => [entry.id, entry])).values(),
    ];
    const metadata = (entry) => ({
      id: entry.id,
      title: String(entry.title || 'Verhaal').slice(0, 300),
    });
    return {
      version: 1,
      saved: unique(
        saved
          .filter((entry) => entry && validId(entry.id))
          .slice(0, 300)
          .map(metadata),
      ),
      history: unique(
        history
          .filter(
            (entry) =>
              entry &&
              validId(entry.id) &&
              Number.isFinite(entry.ratio) &&
              Number.isFinite(entry.updatedAt),
          )
          .slice(0, 100)
          .map((entry) => ({
            ...metadata(entry),
            ratio: clamp(entry.ratio),
            block: Number.isInteger(entry.block)
              ? clamp(entry.block, 0, 100000)
              : 0,
            offset: Number.isFinite(entry.offset) ? clamp(entry.offset) : 0,
            updatedAt: entry.updatedAt,
            route:
              typeof entry.route === 'string' &&
              /^[a-z0-9-]{1,100}$/.test(entry.route)
                ? entry.route
                : '',
          }))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      ).slice(0, 60),
    };
  }
  let storage;
  let durable = true;
  let state = empty();
  function storedState() {
    try {
      return normalize(JSON.parse(storage?.getItem(key) || 'null'));
    } catch {
      return null;
    }
  }
  try {
    storage = window.localStorage;
    state = storedState() || empty();
  } catch {
    durable = false;
  }
  function update(change) {
    if (storage && durable) state = storedState() || state;
    change(state);
    state = normalize(state);
    try {
      if (!storage) throw new Error('Unavailable');
      storage.setItem(key, JSON.stringify(state));
    } catch {
      durable = false;
    }
    syncBookmarks();
    renderShelf();
    if (catalogLoaded) renderLibrary();
  }
  function storyHref(id, position) {
    const params = new URLSearchParams();
    if (position) {
      if (position.route) params.set('route', position.route);
      params.set('resume', '1');
    }
    return `/posts/${encodeURIComponent(id)}${params.size ? `?${params}` : ''}`;
  }
  const unfinished = () =>
    state.history.filter((entry) => entry.ratio > 0.02 && entry.ratio < 0.97);
  function syncBookmarks() {
    const ids = new Set(state.saved.map((entry) => entry.id));
    for (const button of document.querySelectorAll('[data-bookmark]')) {
      const saved = ids.has(button.dataset.bookmark);
      button.hidden = false;
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute(
        'aria-label',
        `${saved ? 'Verwijder uit je leeslijst:' : 'Bewaar'} ${button.dataset.bookmarkTitle}`,
      );
      const label = saved ? 'Bewaard' : 'Bewaren';
      const span = button.querySelector('[data-bookmark-label]');
      if (span && span.textContent !== label) span.textContent = label;
    }
  }
  let notificationTimer;
  function announce(message) {
    const status =
      document.querySelector('[data-library-status]') ||
      document.querySelector('[data-reading-status]') ||
      document.querySelector('[data-global-reading-status]');
    if (status)
      status.textContent =
        message +
        (durable
          ? ''
          : ' Opslag is niet beschikbaar; de wijziging blijft alleen op deze pagina.');
    if (status?.matches('[data-global-reading-status]')) {
      const toast = document.querySelector('[data-reading-toast]');
      toast.hidden = false;
      clearTimeout(notificationTimer);
      if (durable)
        notificationTimer = setTimeout(() => {
          toast.hidden = true;
        }, 5000);
    }
  }
  document
    .querySelector('[data-reading-toast-close]')
    ?.addEventListener('click', () => {
      document.querySelector('[data-reading-toast]').hidden = true;
      clearTimeout(notificationTimer);
    });
  function renderShelf() {
    const shelf = document.querySelector('[data-personal-shelf]');
    if (!shelf) return;
    const recent = unfinished().find(
      (entry) => !catalogLoaded || catalogFailed || catalog.has(entry.id),
    );
    shelf.hidden = !recent;
    if (recent) {
      shelf.querySelector('[data-resume-title]').textContent = recent.title;
      shelf.querySelector('[data-resume-link]').href = storyHref(
        recent.id,
        recent,
      );
    }
  }
  let catalogLoaded = false;
  let catalog = new Map();
  let catalogFailed = false;
  function libraryCard(entry, saved) {
    const post = catalog.get(entry.id);
    const unavailable = !post && !catalogFailed;
    const position = state.history.find((item) => item.id === entry.id);
    const card = document.createElement('article');
    card.className = 'library-card';
    const author = document.createElement('p');
    author.className = 'eyebrow';
    author.textContent =
      post?.author ||
      (unavailable ? 'Niet meer in het archief' : 'Bewaard op dit apparaat');
    const heading = document.createElement('h3');
    const title = post?.title || entry.title;
    if (unavailable) heading.textContent = title;
    else {
      const link = document.createElement('a');
      link.href = storyHref(
        entry.id,
        position && position.ratio > 0.02 && position.ratio < 0.97
          ? position
          : null,
      );
      link.textContent = title;
      heading.append(link);
    }
    card.append(author, heading);
    const detail = document.createElement('p');
    detail.textContent = unavailable
      ? 'Dit verhaal is niet meer beschikbaar.'
      : position
        ? position.ratio >= 0.97
          ? 'Uitgelezen'
          : `${Math.round(position.ratio * 100)}% leesvoortgang`
        : 'Klaar voor wanneer jij wilt lezen.';
    card.append(detail);
    if (saved) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.dataset.removeBookmark = entry.id;
      remove.textContent = 'Verwijderen';
      remove.setAttribute('aria-label', `Verwijder uit je leeslijst: ${title}`);
      card.append(remove);
    }
    return card;
  }
  function renderLibrary() {
    const savedList = document.querySelector('[data-saved-list]');
    if (!savedList) return;
    const continueList = document.querySelector('[data-continue-list]');
    savedList.replaceChildren(
      ...state.saved.map((entry) => libraryCard(entry, true)),
    );
    continueList.replaceChildren(
      ...unfinished().map((entry) => libraryCard(entry, false)),
    );
    for (const [list, message] of [
      [
        savedList,
        'Bewaar een verhaal met de knop Bewaren. Je vindt het daarna hier terug.',
      ],
      [
        continueList,
        'Wanneer je in een langer verhaal leest, kun je hier later verdergaan.',
      ],
    ]) {
      if (!list.childElementCount) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = message;
        list.append(p);
      }
    }
    document.querySelector('[data-saved-count]').textContent =
      `${state.saved.length} ${state.saved.length === 1 ? 'verhaal' : 'verhalen'}`;
    document.querySelector('[data-library-controls]').hidden = false;
    document.querySelector('[data-clear-library]').disabled =
      !state.saved.length && !state.history.length;
    if (!durable)
      document.querySelector('[data-library-note]').textContent =
        'Opslag op dit apparaat is niet beschikbaar. Je wijzigingen blijven alleen op deze pagina.';
    savedList.classList.add('is-ready');
  }
  document.addEventListener('click', (event) => {
    const bookmark = event.target.closest('[data-bookmark]');
    const remove = event.target.closest('[data-remove-bookmark]');
    if (!bookmark && !remove) return;
    const id = bookmark?.dataset.bookmark || remove.dataset.removeBookmark;
    const exists = state.saved.some((entry) => entry.id === id);
    if (!remove && !exists && state.saved.length >= 300) {
      announce(
        'Je kunt maximaal 300 verhalen bewaren. Verwijder eerst een verhaal uit je leeslijst.',
      );
      return;
    }
    update((current) => {
      if (remove || current.saved.some((entry) => entry.id === id))
        current.saved = current.saved.filter((entry) => entry.id !== id);
      else current.saved.unshift({ id, title: bookmark.dataset.bookmarkTitle });
    });
    announce(
      remove || exists
        ? 'Verhaal uit je leeslijst verwijderd.'
        : 'Verhaal bewaard in je leeslijst.',
    );
    if (remove)
      (
        document.querySelector('[data-remove-bookmark]') ||
        document.querySelector('#saved-heading')
      )?.focus();
  });
  document.addEventListener('hyperpedia:archive-updated', syncBookmarks);
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    state = storedState() || empty();
    syncBookmarks();
    renderShelf();
    if (catalogLoaded) renderLibrary();
  });
  const clearDialog = document.querySelector('[data-clear-dialog]');
  document
    .querySelector('[data-clear-library]')
    ?.addEventListener('click', () => clearDialog.showModal());
  document
    .querySelector('[data-cancel-clear]')
    ?.addEventListener('click', () => clearDialog.close());
  document
    .querySelector('[data-confirm-clear]')
    ?.addEventListener('click', () => {
      update((current) => {
        current.saved = [];
        current.history = [];
      });
      clearDialog.close();
      announce('Je leeslijst en leesvoortgang zijn gewist.');
      document.querySelector('#saved-heading').focus();
    });
  syncBookmarks();
  renderShelf();
  if (
    document.querySelector('[data-saved-list]') ||
    (document.querySelector('[data-personal-shelf]') && unfinished().length)
  ) {
    fetch('/leeslijst/catalogus.json', {
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Catalog unavailable');
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data.posts)) throw new Error('Invalid catalog');
        catalog = new Map(
          data.posts
            .filter(
              (post) =>
                post &&
                validId(post.id) &&
                typeof post.title === 'string' &&
                typeof post.author === 'string',
            )
            .map((post) => [post.id, post]),
        );
      })
      .catch(() => {
        catalogFailed = true;
      })
      .finally(() => {
        catalogLoaded = true;
        renderLibrary();
        renderShelf();
        if (catalogFailed)
          announce(
            'Het archief kon niet worden gecontroleerd. Je lokaal bewaarde lijst blijft beschikbaar.',
          );
      });
  }
  const reader = document.querySelector('[data-reader]');
  if (!reader) return;
  if (window.matchMedia('(max-width: 650px)').matches)
    reader.querySelector('.reading-preferences').open = false;
  const body = reader.querySelector('.story-content');
  const blocks = [...body.querySelectorAll('[data-reading-block]')];
  const toolbar = reader.querySelector('.reader-toolbar');
  const focusButton = reader.querySelector('[data-focus-toggle]');
  const progressArea = reader.querySelector('[data-progress-area]');
  const progressControl = reader.querySelector('[data-progress-toggle]');
  const progress = reader.querySelector('[data-reading-progress]');
  const resumeNotice = reader.querySelector('[data-story-resume]');
  let savedPosition = state.history.find(
    (entry) => entry.id === reader.dataset.readerId,
  );
  let restoring = false;
  let restoreGeneration = 0;
  let scrollFrame;
  let saveTimer;
  let currentPosition;
  let readingOffset = 100;
  function offsets() {
    const headerHeight = document
      .querySelector('.site-header')
      .getBoundingClientRect().height;
    document.documentElement.style.setProperty(
      '--reader-top',
      `${headerHeight + 8}px`,
    );
    readingOffset = headerHeight + toolbar.getBoundingClientRect().height + 24;
    document.documentElement.style.setProperty(
      '--reader-scroll-offset',
      `${readingOffset}px`,
    );
  }
  function position() {
    const rect = body.getBoundingClientRect();
    if (rect.top > readingOffset || rect.bottom <= 0 || !blocks.length)
      return null;
    let index = blocks.findIndex(
      (block) => block.getBoundingClientRect().bottom > readingOffset,
    );
    if (index < 0) index = blocks.length - 1;
    const block = blocks[index].getBoundingClientRect();
    const ratio = clamp(
      (readingOffset - rect.top) /
        Math.max(1, rect.height - (window.innerHeight - readingOffset)),
    );
    return {
      id: reader.dataset.readerId,
      title: reader.dataset.readerTitle,
      ratio,
      block: index,
      offset: clamp((readingOffset - block.top) / Math.max(1, block.height)),
      updatedAt: Date.now(),
      route: reader.dataset.readerRoute,
    };
  }
  function paintProgress() {
    scrollFrame = undefined;
    if (restoring) return;
    currentPosition = position();
    const percent = Math.round((currentPosition?.ratio || 0) * 100);
    progress.value = percent;
    reader.querySelector('[data-progress-label]').textContent =
      percent >= 97 ? 'Uitgelezen' : `${percent}%`;
  }
  function savePosition() {
    if (restoring || !currentPosition) return;
    const entry = { ...currentPosition, updatedAt: Date.now() };
    update((current) => {
      current.history = [
        entry,
        ...current.history.filter((item) => item.id !== entry.id),
      ];
    });
  }
  function restore(entry) {
    if (!entry || !blocks.length) return;
    const generation = ++restoreGeneration;
    restoring = true;
    clearTimeout(saveTimer);
    resumeNotice.hidden = true;
    requestAnimationFrame(() => {
      if (generation !== restoreGeneration) return;
      offsets();
      const block =
        blocks[
          Math.min(entry.block, blocks.length - 1)
        ].getBoundingClientRect();
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo({
        top: Math.max(
          0,
          window.scrollY +
            block.top +
            block.height * entry.offset -
            readingOffset,
        ),
        behavior: 'auto',
      });
      root.style.scrollBehavior = previous;
      requestAnimationFrame(() => {
        if (generation !== restoreGeneration) return;
        restoring = false;
        paintProgress();
      });
    });
  }
  function setFocus(focused, preserve = true) {
    const previous = preserve ? position() : null;
    document.body.dataset.readingFocus = String(focused);
    focusButton.setAttribute('aria-pressed', String(focused));
    focusButton.querySelector('[data-focus-label]').textContent = focused
      ? 'Focus verlaten'
      : 'Focus';
    try {
      storage?.setItem('reading-focus', String(focused));
    } catch {}
    offsets();
    if (previous) restore(previous);
  }
  focusButton.hidden = false;
  reader.querySelector('[data-progress-setting]').hidden = false;
  try {
    progressControl.checked =
      storage?.getItem('reading-progress-visible') !== 'false';
  } catch {}
  const syncProgress = () => {
    progressArea.hidden = !progressControl.checked;
    offsets();
  };
  syncProgress();
  progressControl.addEventListener('change', () => {
    const previous = position();
    try {
      storage?.setItem(
        'reading-progress-visible',
        String(progressControl.checked),
      );
    } catch {}
    syncProgress();
    if (previous) restore(previous);
  });
  let focused = false;
  try {
    focused = storage?.getItem('reading-focus') === 'true';
  } catch {}
  setFocus(focused, false);
  focusButton.addEventListener('click', () =>
    setFocus(document.body.dataset.readingFocus !== 'true'),
  );
  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      document.body.dataset.readingFocus === 'true' &&
      !document.querySelector('dialog[open]')
    )
      setFocus(false);
  });
  reader
    .querySelector('a[href="#related-stories"]')
    ?.addEventListener('click', () => {
      if (document.body.dataset.readingFocus === 'true') setFocus(false, false);
    });
  reader
    .querySelector('[data-resume-position]')
    .addEventListener('click', () => restore(savedPosition));
  if (
    savedPosition &&
    savedPosition.ratio > 0.02 &&
    savedPosition.ratio < 0.97
  ) {
    if (new URL(window.location.href).searchParams.get('resume') === '1')
      restore(savedPosition);
    else resumeNotice.hidden = false;
  }
  window.addEventListener(
    'scroll',
    () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(paintProgress);
      if (!restoring) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(savePosition, 700);
      }
    },
    { passive: true },
  );
  window.addEventListener('pagehide', savePosition);
  window.addEventListener('resize', () => {
    offsets();
    if (currentPosition && !restoring) restore(currentPosition);
    else paintProgress();
  });
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(offsets);
    observer.observe(toolbar);
    observer.observe(document.querySelector('.site-header'));
  }
  offsets();
  paintProgress();
})();
