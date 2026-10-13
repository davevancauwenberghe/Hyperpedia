const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const memory = (values) => ({
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
});
function boot({
  local = new Map(),
  session = new Map(),
  blocked = false,
} = {}) {
  const root = { dataset: {} };
  const listeners = {};
  const meta = {
    setAttribute(key, value) {
      this[key] = value;
    },
  };
  const toggle = {
    setAttribute() {},
    addEventListener(event, handler) {
      listeners[event] = handler;
    },
  };
  const control = {
    value: '',
    addEventListener(event, callback) {
      this[event] = callback;
    },
  };
  const window = {
    matchMedia: () => ({ matches: blocked, addEventListener() {} }),
    addEventListener() {},
    dispatchEvent() {},
    get localStorage() {
      if (blocked) throw new Error('Storage blocked');
      return memory(local);
    },
    get sessionStorage() {
      if (blocked) throw new Error('Storage blocked');
      return memory(session);
    },
  };
  const context = vm.createContext({
    window,
    CustomEvent: class {},
    document: {
      documentElement: root,
      querySelector: (selector) =>
        selector === '.theme-toggle'
          ? toggle
          : selector.includes('theme-color')
            ? meta
            : null,
      querySelectorAll: (selector) =>
        selector === 'select[data-reading-size]' ? [control] : [],
    },
  });
  for (const file of ['storage.js', 'theme.js', 'app.js'])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8'),
      context,
    );
  return { root, meta, listeners, control, storage: window.hyperpediaStorage };
}

test('blocked browser storage does not break theme initialization or toggling', () => {
  const { root, meta, listeners } = boot({ blocked: true });
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(meta.content, '#1d1916');
  listeners.click();
  assert.equal(root.dataset.theme, 'light');
  assert.equal(meta.content, '#f7f1e8');
});

test('reader text size survives refresh in this session, but durable storage requires consent', () => {
  const local = new Map();
  const session = new Map();
  const { root, control, storage } = boot({ local, session });
  assert.equal(control.value, 'normal');
  control.value = 'extra';
  control.change();
  assert.equal(root.dataset.readingSize, 'extra');
  assert.equal(local.has('hyperpedia-preferences-v1'), false);
  assert.equal(boot({ local, session }).control.value, 'extra');
  assert.equal(boot({ local }).control.value, 'normal');
  storage.choose(true, false);
  assert.equal(boot({ local }).control.value, 'extra');
  local.set(
    'hyperpedia-preferences-v1',
    JSON.stringify({ 'reading-size': 'unexpected' }),
  );
  assert.equal(boot({ local }).control.value, 'normal');
});

test('acceptance and refusal expire in exactly one year, and revocation removes durable preferences', () => {
  const local = new Map();
  const storage = boot({ local }).storage;
  storage.set('reading-preferences-open', 'true');
  storage.choose(true, true);
  const consent = JSON.parse(local.get('hyperpedia-consent-v1'));
  assert.equal(
    consent.expiresAt - consent.decidedAt,
    365 * 24 * 60 * 60 * 1000,
  );
  assert.equal(boot({ local }).storage.get('reading-preferences-open'), 'true');
  storage.choose(false, false);
  assert.equal(local.has('hyperpedia-preferences-v1'), false);
  assert.equal(boot({ local }).storage.consent().statistics, false);
  const expired = JSON.parse(local.get('hyperpedia-consent-v1'));
  expired.decidedAt -= storage.year + 1;
  expired.expiresAt -= storage.year + 1;
  local.set('hyperpedia-consent-v1', JSON.stringify(expired));
  assert.equal(boot({ local }).storage.consent(), null);
  assert.equal(local.has('hyperpedia-consent-v1'), false);
});

test('optional preferences are not read without valid consent or with a forged expiry', () => {
  const now = Date.now();
  const local = new Map([
    [
      'hyperpedia-preferences-v1',
      JSON.stringify({ theme: 'dark', 'reading-size': 'large' }),
    ],
    [
      'hyperpedia-consent-v1',
      JSON.stringify({
        version: 1,
        preferences: true,
        statistics: true,
        decidedAt: now,
        expiresAt: now + 10 * 365 * 24 * 60 * 60 * 1000,
      }),
    ],
  ]);
  const { root, storage } = boot({ local });
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.dataset.readingSize, 'normal');
  assert.equal(storage.consent(), null);
  assert.equal(local.has('hyperpedia-preferences-v1'), false);
});

test('malformed preference keys cannot break storage initialization', () => {
  const now = Date.now();
  const local = new Map([
    [
      'hyperpedia-consent-v1',
      JSON.stringify({
        version: 1,
        preferences: true,
        statistics: false,
        decidedAt: now,
        expiresAt: now + 365 * 24 * 60 * 60 * 1000,
      }),
    ],
    [
      'hyperpedia-preferences-v1',
      '{"constructor":"dark","__proto__":{"theme":"dark"},"theme":"light"}',
    ],
  ]);
  assert.equal(boot({ local }).root.dataset.theme, 'light');
});

test('changing a preference in another tab does not overwrite the stored disclosure choice', () => {
  const local = new Map();
  const first = boot({ local }).storage;
  first.choose(true, false);
  const second = boot({ local }).storage;
  first.set('reading-preferences-open', 'true');
  second.set('reading-size', 'large');
  const restored = boot({ local }).storage;
  assert.equal(restored.get('reading-preferences-open'), 'true');
  assert.equal(restored.get('reading-size'), 'large');
});

test('cross-tab revocation gates optional writes even before the storage event arrives', () => {
  const local = new Map();
  const first = boot({ local }).storage;
  first.choose(true, true);
  const second = boot({ local }).storage;
  first.choose(false, false);
  second.set('reading-size', 'extra');
  assert.equal(local.has('hyperpedia-preferences-v1'), false);
  assert.equal(second.consent().statistics, false);
});
