const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('blocked browser storage does not break theme initialization or toggling', () => {
  const root = { dataset: {} };
  const listeners = {};
  const meta = { setAttribute(key, value) { this[key] = value; } };
  const toggle = { setAttribute() {}, addEventListener(event, handler) { listeners[event] = handler; } };
  const context = vm.createContext({
    document: { documentElement: root, querySelector: selector => selector === '.theme-toggle' ? toggle : selector.includes('theme-color') ? meta : null, querySelectorAll: () => [] },
    window: { matchMedia: () => ({ matches: true, addEventListener() {} }) },
    get localStorage() { throw new Error('Storage blocked'); },
  });
  for (const file of ['theme.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8'), context);
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(meta.content, '#1d1916');
  listeners.click();
  assert.equal(root.dataset.theme, 'light');
  assert.equal(meta.content, '#f7f1e8');
});

test('reader text size persists and restores without accepting an invalid saved choice', () => {
  const values = new Map([['reading-size', 'large']]);
  const boot = () => {
    const root = { dataset: {} };
    const control = { value: '', addEventListener(event, callback) { this[event] = callback; } };
    const context = vm.createContext({
      localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
      document: { documentElement: root, querySelector: () => null, querySelectorAll: selector => selector === 'select[data-reading-size]' ? [control] : [] },
      window: { matchMedia: () => ({ matches: false, addEventListener() {} }) },
    });
    for (const file of ['theme.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8'), context);
    return { root, control };
  };
  const { root, control } = boot();
  assert.equal(control.value, 'large');
  control.value = 'extra';
  control.change();
  assert.equal(root.dataset.readingSize, 'extra');
  assert.equal(boot().control.value, 'extra');
  values.set('reading-size', 'unexpected');
  assert.equal(boot().control.value, 'normal');
});
