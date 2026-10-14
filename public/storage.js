// Only the consent decision and explicitly saved stories use durable storage by default.
(() => {
  const YEAR = 365 * 24 * 60 * 60 * 1000;
  const consentKey = 'hyperpedia-consent-v1';
  const preferenceKey = 'hyperpedia-preferences-v1';
  const sessionKey = 'hyperpedia-session-preferences-v1';
  const allowed = {
    theme: ['light', 'dark'],
    'reading-size': ['normal', 'large', 'extra'],
    'reading-width': ['wide', 'focused'],
    'reading-focus': ['true', 'false'],
    'reading-preferences-open': ['true', 'false'],
  };
  const read = (area, key) => {
    try {
      return JSON.parse(window[area].getItem(key) || 'null');
    } catch {
      return null;
    }
  };
  const remove = (area, key) => {
    try {
      window[area].removeItem(key);
    } catch {}
  };
  const write = (area, key, value) => {
    try {
      window[area].setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  const validConsent = (value) =>
    value?.version === 1 &&
    typeof value.preferences === 'boolean' &&
    typeof value.statistics === 'boolean' &&
    Number.isFinite(value.decidedAt) &&
    value.decidedAt <= Date.now() &&
    value.expiresAt === value.decidedAt + YEAR &&
    value.expiresAt > Date.now();
  const clean = (value) =>
    Object.fromEntries(
      Object.entries(value || {}).filter(
        ([key, option]) =>
          Array.isArray(allowed[key]) && allowed[key].includes(option),
      ),
    );
  let choice = read('localStorage', consentKey);
  let ephemeralChoice = false;
  if (!validConsent(choice)) {
    choice = null;
    remove('localStorage', consentKey);
    remove('localStorage', preferenceKey);
  }
  let preferences = clean(read('sessionStorage', sessionKey));
  if (choice?.preferences)
    preferences = {
      ...preferences,
      ...clean(read('localStorage', preferenceKey)),
    };
  const consent = () => {
    // Check shared consent before each optional operation, including the short
    // interval before another tab's storage event has reached this page.
    if (!ephemeralChoice) {
      const stored = read('localStorage', consentKey);
      choice = validConsent(stored) ? stored : null;
      if (!choice) remove('localStorage', consentKey);
      if (!choice?.preferences) remove('localStorage', preferenceKey);
    }
    if (choice && !validConsent(choice)) {
      choice = null;
      remove('localStorage', consentKey);
      remove('localStorage', preferenceKey);
    }
    return choice;
  };
  window.hyperpediaStorage = {
    year: YEAR,
    consent,
    get: (key) => preferences[key],
    set(key, value) {
      if (!Array.isArray(allowed[key]) || !allowed[key].includes(value)) return;
      const persistent = consent()?.preferences && !ephemeralChoice;
      if (persistent)
        preferences = {
          ...preferences,
          ...clean(read('localStorage', preferenceKey)),
        };
      preferences[key] = value;
      write('sessionStorage', sessionKey, preferences);
      if (persistent) write('localStorage', preferenceKey, preferences);
    },
    choose(preferencesAllowed, statisticsAllowed) {
      const now = Date.now();
      if (consent()?.preferences)
        preferences = {
          ...preferences,
          ...clean(read('localStorage', preferenceKey)),
        };
      choice = {
        version: 1,
        preferences: preferencesAllowed === true,
        statistics: statisticsAllowed === true,
        decidedAt: now,
        expiresAt: now + YEAR,
      };
      write('sessionStorage', sessionKey, preferences);
      const durable = write('localStorage', consentKey, choice);
      ephemeralChoice = !durable;
      if (choice.preferences && durable)
        write('localStorage', preferenceKey, preferences);
      else remove('localStorage', preferenceKey);
      window.dispatchEvent(new CustomEvent('hyperpedia:consent'));
      return durable;
    },
  };
  window.addEventListener('storage', (event) => {
    if (event.key !== consentKey && event.key !== null) return;
    const value = read('localStorage', consentKey);
    ephemeralChoice = false;
    choice = validConsent(value) ? value : null;
    if (!choice?.preferences) remove('localStorage', preferenceKey);
    window.dispatchEvent(new CustomEvent('hyperpedia:consent'));
  });
})();
