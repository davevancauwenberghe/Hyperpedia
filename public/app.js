const root = document.documentElement;
const themeToggle = document.querySelector('.theme-toggle');
let explicitTheme = ['dark', 'light'].includes(window.hyperpediaStorage.get('theme'));

const syncThemeControl = () => {
  const isDark = root.dataset.theme === 'dark';
  if (themeToggle) {
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute(
      'aria-label',
      isDark ? 'Licht thema gebruiken' : 'Donker thema gebruiken',
    );
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? '#1d1916' : '#f7f1e8');
};

syncThemeControl();
themeToggle?.addEventListener('click', () => {
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  explicitTheme = true;
  window.hyperpediaStorage.set('theme', next);
  syncThemeControl();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  if (!explicitTheme) {
    root.dataset.theme = event.matches ? 'dark' : 'light';
    syncThemeControl();
  }
});

for (const control of document.querySelectorAll('select[data-reading-size]')) {
  control.value = root.dataset.readingSize || 'normal';
  control.addEventListener('change', () => {
    if (!['normal', 'large', 'extra'].includes(control.value)) return;
    root.dataset.readingSize = control.value;
    window.hyperpediaStorage.set('reading-size', control.value);
  });
}

for (const control of document.querySelectorAll('select[data-reading-width]')) {
  control.value = root.dataset.readingWidth || 'wide';
  control.addEventListener('change', () => {
    if (!['wide', 'focused'].includes(control.value)) return;
    root.dataset.readingWidth = control.value;
    window.hyperpediaStorage.set('reading-width', control.value);
  });
}

for (const carousel of document.querySelectorAll('[data-daily-stories]')) {
  const slides = [...carousel.querySelectorAll('.daily-story-slide')];
  const dots = [...carousel.querySelectorAll('.daily-story-dot')];
  const previous = carousel.querySelector('[data-daily-prev]');
  const next = carousel.querySelector('[data-daily-next]');
  if (slides.length < 2) continue;

  let activeIndex = Math.max(
    0,
    slides.findIndex((slide) => slide.classList.contains('is-active')),
  );

  const showStory = (nextIndex) => {
    activeIndex = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.classList.toggle('is-active', isActive);
      slide.hidden = !isActive;
      if (isActive) slide.removeAttribute('aria-hidden');
      else slide.setAttribute('aria-hidden', 'true');
    });
    dots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === activeIndex);
      if (index === activeIndex) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };

  dots.forEach((dot, index) => dot.addEventListener('click', () => showStory(index)));
  previous?.addEventListener('click', () => showStory(activeIndex - 1));
  next?.addEventListener('click', () => showStory(activeIndex + 1));
}

const openedPost = document.querySelector('[data-post-id]');
let readCounted = false;
function countRead() {
  if (!openedPost?.dataset.postId || readCounted || !window.hyperpediaStorage.consent()?.statistics)
    return;
  readCounted = true;
  const readUrl = `/posts/${encodeURIComponent(openedPost.dataset.postId)}/read`;
  fetch(readUrl, {
    method: 'POST',
    headers: { 'X-Hyperpedia-Consent': 'statistics' },
    credentials: 'omit',
    keepalive: true,
  }).catch(() => {});
}
countRead();
window.addEventListener('hyperpedia:consent', countRead);

const infoDialog = document.querySelector('[data-info-dialog]');
const openInfoButtons = document.querySelectorAll('[data-info-open]');
const closeInfoButtons = document.querySelectorAll('[data-info-close]');

if (infoDialog) {
  const openInfoDialog = () => {
    if (typeof infoDialog.showModal === 'function') infoDialog.showModal();
    else infoDialog.setAttribute('open', '');
  };
  const closeInfoDialog = () => infoDialog.close?.() || infoDialog.removeAttribute('open');

  openInfoButtons.forEach((button) => button.addEventListener('click', openInfoDialog));
  closeInfoButtons.forEach((button) => button.addEventListener('click', closeInfoDialog));
  infoDialog.addEventListener('click', (event) => {
    const rect = infoDialog.getBoundingClientRect();
    if (
      event.target === infoDialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      closeInfoDialog();
  });
}

const storyActions = document.querySelector('[data-story-actions]');
if (storyActions) {
  storyActions.hidden = false;
  const link = storyActions.querySelector('[data-share-url]');
  const status = storyActions.querySelector('[data-action-status]');
  const showStatus = (message) => {
    status.textContent = message;
  };
  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(link.value);
      showStatus('Link gekopieerd.');
    } catch {
      link.hidden = false;
      link.focus();
      link.select();
      showStatus('Selecteer en kopieer de link hieronder.');
    }
  };
  storyActions.querySelector('[data-story-copy]').addEventListener('click', copyLink);
  const shareButton = storyActions.querySelector('[data-story-share]');
  shareButton.addEventListener('click', async () => {
    if (typeof navigator.share !== 'function') return copyLink();
    try {
      await navigator.share({
        title: document.querySelector('.story h1').textContent,
        url: link.value,
      });
    } catch (error) {
      if (error.name !== 'AbortError') showStatus('Delen lukt niet. Gebruik Link kopiëren.');
    }
  });
  storyActions.querySelector('[data-story-print]').addEventListener('click', () => window.print());
}
