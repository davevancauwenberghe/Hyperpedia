const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
process.env.DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/hyper-pwa-browser-');
process.env.SESSION_SECRET = 'x'.repeat(32);
delete process.env.SITE_URL;
// Use a disposable asset tree to replay a deployment without touching source files.
const assetModule = require('../src/assets');
const publicDir = path.join(process.env.DATA_DIR, 'public');
fs.cpSync(path.join(__dirname, '../public'), publicDir, { recursive: true });
Object.assign(assetModule, assetModule.createAssetService(publicDir));
const store = require('../src/store');
store.saveAdmin('admin', 'safe-password');
store.savePosts([
  {
    id: 'story',
    title: 'Origineel archiefverhaal',
    author: 'Archiefnaam',
    body: 'De oorspronkelijke tekst van het verhaal.',
    labels: ['onrust'],
    replies: [],
  },
]);
const { server } = require('../src/server');
async function run() {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE || undefined,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 850 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator('[data-consent-reject]').click();
    assert.equal(
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
      0,
      'Ordinary browsing does not install an app cache',
    );
    await page.locator('[data-info-open]').click();
    await page.locator('.install-help summary').click();
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt');
      event.prompt = async () => {
        window.prompted = true;
      };
      event.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(event);
    });
    await page.locator('[data-install-app]').click();
    assert.equal(await page.evaluate(() => window.prompted), true);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const shell = async () =>
      page.evaluate(async () => {
        const names = await caches.keys();
        const cache = await caches.open(names.find((name) => name.startsWith('hyperpedia-shell-')));
        return (await cache.keys()).map((request) => new URL(request.url).pathname).sort();
      });
    const expected = [
      '/favicon.svg',
      '/offline.html',
      '/offline.js',
      '/storage.js',
      '/style.css',
      '/theme.js',
    ].sort();
    assert.deepEqual(await shell(), expected);
    await context.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { value: true }),
    );
    await page.goto(base + '/login');
    await page.locator('[name="username"]').fill('admin');
    await page.locator('[name="password"]').fill('safe-password');
    await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
    await page.waitForURL('**/admin');
    await page.goto(base + '/posts/story');
    assert.equal(await page.getByRole('button', { name: 'Uitloggen', exact: true }).count(), 1);
    await page.goto(base + '/privacy');
    assert.deepEqual(await shell(), expected, 'No administrator or visited story HTML is cached');
    const oldWorker = await page.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    const oldCaches = await page.evaluate(() => caches.keys());
    fs.appendFileSync(path.join(publicDir, 'style.css'), '\n/* installed-app-hotfix */\n');
    await page.reload();
    // Poll from Node: an async waitForFunction predicate in Playwright 1.64
    // settles after its first evaluation, including when it resolves to false.
    const updateDeadline = Date.now() + 30_000;
    for (;;) {
      const activated = await page.evaluate(async (previous) => {
        const registration = await navigator.serviceWorker.getRegistration();
        const controller = navigator.serviceWorker.controller;
        return Boolean(
          controller &&
          controller.scriptURL !== previous &&
          registration?.active?.state === 'activated',
        );
      }, oldWorker);
      if (activated) break;
      assert.ok(Date.now() < updateDeadline, 'The installed-app worker update never activated');
      await page.waitForTimeout(100);
    }
    const updatedCaches = await page.evaluate(() => caches.keys());
    const workerStates = await Promise.all(
      context.serviceWorkers().map(async (worker) => {
        try {
          return await worker.evaluate('({location: self.location.href, cacheName, version})');
        } catch {
          return { closed: true };
        }
      }),
    );
    const updateState = JSON.stringify({ oldWorker, oldCaches, updatedCaches, workerStates });
    assert.equal(
      updatedCaches.filter((name) => name.startsWith('hyperpedia-shell-')).length,
      1,
      updateState,
    );
    assert.ok(
      oldCaches.every((name) => !updatedCaches.includes(name)),
      updateState,
    );
    assert.match(
      await page.evaluate(async () => {
        const cache = await caches.open(
          (await caches.keys()).find((name) => name.startsWith('hyperpedia-shell-')),
        );
        return (await cache.match('/style.css')).text();
      }),
      /installed-app-hotfix/,
    );
    assert.deepEqual(await shell(), expected);
    await context.setOffline(true);
    const offline = await page.goto(base + '/posts/story');
    assert.equal(offline.status(), 503);
    assert.match(await page.locator('h1').textContent(), /Even geen verbinding/);
    assert.equal(await page.locator('[data-reader]').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Uitloggen', exact: true }).count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
    );
    await context.setOffline(false);
    await page.locator('[data-offline-retry]').click();
    await page.locator('[data-reader]').waitFor();
    assert.equal(new URL(page.url()).pathname, '/posts/story');
    assert.match(await page.locator('.body').textContent(), /oorspronkelijke tekst/);
    assert.deepEqual(await shell(), expected);
    await context.setOffline(true);
    await assert.rejects(page.goto(base + '/login'), /net::ERR_/);
    await context.setOffline(false);
    await context.close();
    // Legacy iOS standalone detection initializes the same standards-based shell.
    const ios = await browser.newContext({
      viewport: { width: 390, height: 850 },
    });
    await ios.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    const iosPage = await ios.newPage();
    iosPage.on('pageerror', (error) => errors.push(error.message));
    await iosPage.goto(base);
    await iosPage.evaluate(() => navigator.serviceWorker.ready);
    await iosPage.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await iosPage.locator('[data-consent-reject]').click();
    await iosPage.locator('[data-info-open]').click();
    assert.match(
      await iosPage.locator('[data-install-guide]').textContent(),
      /Je gebruikt Hyperpedia als webapp/,
    );
    assert.equal(await iosPage.locator('[data-install-app]').isVisible(), false);
    await ios.close();
    assert.deepEqual(errors, []);
    console.log(
      'Install enhancement, content-based updates, iOS standalone detection, bounded app cache, private-page exclusion, offline fallback and recovery: passed',
    );
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
