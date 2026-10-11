// Apply before the stylesheet paints; storage may be unavailable in private contexts.
(() => {
  let saved;
  try { saved = localStorage.getItem('theme'); } catch {}
  const theme = saved === 'dark' || saved === 'light' ? saved : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d1916' : '#f7f1e8');
})();
