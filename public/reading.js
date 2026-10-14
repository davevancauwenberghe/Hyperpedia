(() => {
  const key = 'hyperpedia-reading-v2';
  const year = window.hyperpediaStorage.year;
  const empty = () => ({ version: 2, saved: [] });
  function validId(id) {
    if (typeof id !== 'string' || !id.length || id.length > 512) return false;
    try {
      encodeURIComponent(id);
      return true;
    } catch {
      return false;
    }
  }
  function normalize(value) {
    if (value?.version !== 2 || !Array.isArray(value.saved)) return empty();
    const now = Date.now();
    return {
      version: 2,
      saved: [
        ...new Map(
          value.saved
            .filter(
              (entry) =>
                entry &&
                validId(entry.id) &&
                Number.isFinite(entry.savedAt) &&
                entry.savedAt <= now &&
                entry.savedAt + year > now,
            )
            .slice(0, 300)
            .map((entry) => [
              entry.id,
              {
                id: entry.id,
                title:
                  typeof entry.title === 'string'
                    ? entry.title.slice(0, 300)
                    : 'Verhaal',
                savedAt: entry.savedAt,
              },
            ]),
        ).values(),
      ],
    };
  }
  let storage;
  let durable = true;
  let state = empty();
  function storedState() {
    try {
      return normalize(JSON.parse(storage.getItem(key) || 'null'));
    } catch {
      return null;
    }
  }
  try {
    storage = window.localStorage;
    const current = storage.getItem(key);
    try {
      state = normalize(JSON.parse(current || 'null'));
    } catch {}
    if (current && current !== JSON.stringify(state))
      storage.setItem(key, JSON.stringify(state));
  } catch {
    durable = false;
  }
  function update(change) {
    if (storage && durable) state = storedState() || state;
    change(state);
    state = normalize(state);
    try {
      storage.setItem(key, JSON.stringify(state));
    } catch {
      durable = false;
    }
    syncBookmarks();
    if (catalogLoaded) renderLibrary();
  }
  const storyHref = (id) => `/posts/${encodeURIComponent(id)}`;
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
      button.querySelector('[data-bookmark-label]').textContent = saved
        ? 'Bewaard'
        : 'Bewaren';
    }
  }
  function announce(message) {
    const status =
      document.querySelector('[data-library-status]') ||
      document.querySelector('[data-reading-status]');
    if (status)
      status.textContent =
        message +
        (durable
          ? ''
          : ' Opslag is niet beschikbaar; de wijziging blijft alleen op deze pagina.');
  }
  let catalogLoaded = false;
  let catalogFailed = false;
  let catalog = new Map();
  function libraryCard(entry) {
    const post = catalog.get(entry.id);
    const unavailable = !post && !catalogFailed;
    const card = document.createElement('article');
    card.className = 'library-card';
    const author = document.createElement('p');
    author.className = 'eyebrow';
    author.textContent =
      post?.author ||
      (unavailable ? 'Niet meer in het archief' : 'Bewaard in deze browser');
    const heading = document.createElement('h3');
    const title = post?.title || entry.title;
    if (unavailable) heading.textContent = title;
    else {
      const link = document.createElement('a');
      link.href = storyHref(entry.id);
      link.textContent = title;
      heading.append(link);
    }
    const detail = document.createElement('p');
    detail.textContent = unavailable
      ? 'Dit verhaal is niet meer beschikbaar.'
      : 'Klaar voor wanneer jij wilt lezen.';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'secondary';
    remove.dataset.removeBookmark = entry.id;
    remove.textContent = 'Verwijderen';
    remove.setAttribute('aria-label', `Verwijder uit je leeslijst: ${title}`);
    card.append(author, heading, detail, remove);
    return card;
  }
  function renderLibrary() {
    const list = document.querySelector('[data-saved-list]');
    if (!list) return;
    list.replaceChildren(...state.saved.map(libraryCard));
    if (!list.childElementCount) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent =
        'Open een verhaal en kies Bewaren onder Leesvoorkeuren. Je vindt het daarna hier terug.';
      list.append(p);
    }
    document.querySelector('[data-saved-count]').textContent =
      `${state.saved.length} ${state.saved.length === 1 ? 'verhaal' : 'verhalen'}`;
    document.querySelector('[data-library-controls]').hidden = false;
    document.querySelector('[data-clear-library]').disabled =
      !state.saved.length;
    if (!durable)
      document.querySelector('[data-library-note]').textContent =
        'Opslag in deze browser is niet beschikbaar. Je wijzigingen blijven alleen op deze pagina.';
    list.classList.add('is-ready');
  }
  document.addEventListener('click', (event) => {
    const bookmark = event.target.closest('[data-bookmark]');
    const remove = event.target.closest('[data-remove-bookmark]');
    if (!bookmark && !remove) return;
    const id = bookmark?.dataset.bookmark || remove.dataset.removeBookmark;
    let message;
    update((current) => {
      const exists = current.saved.some((entry) => entry.id === id);
      if (exists || remove) {
        current.saved = current.saved.filter((entry) => entry.id !== id);
        message = 'Verhaal uit je leeslijst verwijderd.';
      } else if (current.saved.length >= 300)
        message =
          'Je leeslijst bevat al 300 verhalen. Verwijder eerst een verhaal.';
      else {
        current.saved.push({
          id,
          title: bookmark.dataset.bookmarkTitle,
          savedAt: Date.now(),
        });
        message = 'Verhaal bewaard in deze browser.';
      }
    });
    announce(message);
    if (remove) document.querySelector('#saved-heading').focus();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    state = storedState() || empty();
    syncBookmarks();
    if (catalogLoaded) renderLibrary();
  });
  const dialog = document.querySelector('[data-clear-dialog]');
  document
    .querySelector('[data-clear-library]')
    ?.addEventListener('click', () => {
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    });
  const closeDialog = () => {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
  };
  document
    .querySelector('[data-cancel-clear]')
    ?.addEventListener('click', closeDialog);
  document
    .querySelector('[data-confirm-clear]')
    ?.addEventListener('click', () => {
      update((current) => {
        current.saved = [];
      });
      closeDialog();
      announce('Je leeslijst is gewist in deze browser.');
      document.querySelector('#saved-heading').focus();
    });
  syncBookmarks();
  if (document.querySelector('[data-saved-list]')) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 8000);
    fetch('/leeslijst/catalogus.json', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Catalog unavailable');
        return response.json();
      })
      .then((value) => {
        if (!Array.isArray(value.posts)) throw new Error('Invalid catalog');
        catalog = new Map(
          value.posts
            .filter((post) => typeof post?.id === 'string')
            .map((post) => [post.id, post]),
        );
      })
      .catch(() => {
        catalogFailed = true;
      })
      .finally(() => {
        clearTimeout(deadline);
        catalogLoaded = true;
        renderLibrary();
        if (catalogFailed)
          announce(
            'De actuele verhalenlijst is niet beschikbaar. Je bewaarde lijst blijft behouden.',
          );
      });
  }
  const reader = document.querySelector('[data-reader]');
  if (!reader) return;
  const preferences = reader.querySelector('.reading-preferences');
  preferences.open =
    window.hyperpediaStorage.get('reading-preferences-open') === 'true';
  preferences.querySelector('summary').addEventListener('click', () => {
    // Summary's default action toggles after click dispatch. Save the intended
    // state synchronously so even an immediate refresh keeps the user's choice.
    window.hyperpediaStorage.set(
      'reading-preferences-open',
      String(!preferences.open),
    );
  });
  const focusButton = reader.querySelector('[data-focus-toggle]');
  function setFocus(enabled, remember) {
    document.documentElement.dataset.readingFocus = String(enabled);
    focusButton.setAttribute('aria-pressed', String(enabled));
    focusButton.querySelector('[data-focus-label]').textContent = enabled
      ? 'Focus verlaten'
      : 'Focus';
    reader.querySelector('[data-focus-summary]').hidden = !enabled;
    if (remember)
      window.hyperpediaStorage.set('reading-focus', String(enabled));
  }
  focusButton.hidden = false;
  setFocus(window.hyperpediaStorage.get('reading-focus') === 'true', false);
  focusButton.addEventListener('click', () =>
    setFocus(focusButton.getAttribute('aria-pressed') !== 'true', true),
  );
  document.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      focusButton.getAttribute('aria-pressed') === 'true' &&
      !document.querySelector('dialog[open]')
    )
      setFocus(false, true);
  });
})();
