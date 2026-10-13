// Apply before the stylesheet paints; storage may be unavailable in private contexts.
(() => {
  const saved = window.hyperpediaStorage.get('theme');
  const readingSize = window.hyperpediaStorage.get('reading-size');
  document.documentElement.dataset.readingSize = ['normal', 'large', 'extra'].includes(readingSize) ? readingSize : 'normal';
  const readingWidth = window.hyperpediaStorage.get('reading-width');
  document.documentElement.dataset.readingWidth = readingWidth === 'focused' ? 'focused' : 'wide';
  const theme = saved === 'dark' || saved === 'light' ? saved : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d1916' : '#f7f1e8');
})();
