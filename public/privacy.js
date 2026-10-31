(() => {
  const storage = window.hyperpediaStorage;
  const banner = document.querySelector('[data-consent-banner]');
  const form = document.querySelector('[data-privacy-form]');
  const status = document.querySelector('[data-privacy-status]');
  function sync() {
    const consent = storage.consent();
    if (banner) banner.hidden = Boolean(consent) || Boolean(form);
    if (form) {
      form.hidden = false;
      form.elements.preferences.checked = consent?.preferences === true;
      form.elements.statistics.checked = consent?.statistics === true;
    }
  }
  function choose(preferences, statistics) {
    const durable = storage.choose(preferences, statistics);
    if (status)
      status.textContent = durable
        ? 'Je keuze is opgeslagen voor één jaar. Je kunt deze hier altijd wijzigen.'
        : 'Opslag is niet beschikbaar. Je keuze geldt alleen voor deze pagina.';
  }
  document
    .querySelectorAll('[data-consent-accept]')
    .forEach((button) => button.addEventListener('click', () => choose(true, true)));
  document
    .querySelectorAll('[data-consent-reject]')
    .forEach((button) => button.addEventListener('click', () => choose(false, false)));
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    choose(form.elements.preferences.checked, form.elements.statistics.checked);
  });
  window.addEventListener('hyperpedia:consent', sync);
  window.addEventListener('pageshow', sync);
  sync();
})();
