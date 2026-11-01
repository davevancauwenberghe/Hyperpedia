(() => {
  const script = document.currentScript;
  const workerUrl = script.dataset.workerUrl || '/sw.js';
  const standalone = window.matchMedia('(display-mode: standalone)');
  const installed = () => standalone.matches || navigator.standalone === true;
  const button = document.querySelector('[data-install-app]');
  const status = document.querySelector('[data-install-status]');
  const guide = document.querySelector('[data-install-guide]');
  let installPrompt;
  let registering;
  function registerOffline() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || registering) return;
    registering = navigator.serviceWorker
      .register(workerUrl, {
        scope: '/',
        updateViaCache: 'none',
      })
      .catch(() => {
        registering = null;
      });
  }
  function sync() {
    if (button) button.hidden = installed() || !installPrompt;
    if (installed()) {
      if (guide)
        guide.textContent =
          'Je gebruikt Hyperpedia als webapp. Nieuwe verhalen laden zodra je verbinding hebt.';
      registerOffline();
    }
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    sync();
  });
  button?.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    sync();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (status)
        status.textContent =
          choice.outcome === 'accepted'
            ? 'Installatie gestart. Je kunt Hyperpedia vanaf je beginscherm openen.'
            : 'Je kunt Hyperpedia later ook via het browsermenu toevoegen.';
    } catch {
      if (status) status.textContent = 'Voeg Hyperpedia toe via het browsermenu.';
    }
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (button) button.hidden = true;
    registerOffline();
  });
  standalone.addEventListener('change', sync);
  sync();
})();
