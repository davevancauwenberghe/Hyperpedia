// Optional browser regression checks. All fixture data is written to a temporary directory.
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium: pw } = require('playwright');
async function within(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Delayed request timed out')),
          10_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
process.env.DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/hyper-release-');
process.env.SESSION_SECRET = 'x'.repeat(32);
delete process.env.SITE_URL;
const store = require('../src/store');
store.saveAdmin('admin', 'safe-password');
const body =
  'Een ervaring uit het archief. Hier staat een langere alinea met veel woorden, zodat de beschikbare leesbreedte op een grote monitor zichtbaar wordt. '.repeat(
    8,
  ) +
  '\n\nEen tweede alinea met een eigen gedachte. ' +
  'We bewaren die tekst zonder de woorden van de auteur te veranderen. '.repeat(
    6,
  );
store.savePosts([
  ...Array.from({ length: 63 }, (_, i) => ({
    id: 'post-' + i,
    title: 'Verhaal ' + String(i).padStart(3, '0'),
    author: 'Lezer',
    body,
    labels: ['stress', 'ademhaling'],
    replies: [
      {
        id: 'reply-1',
        author: 'Andere lezer',
        body: 'Een antwoord op het verhaal.',
      },
    ],
  })),
  {
    id: 'solo',
    title: 'Zonder reacties',
    author: 'Lezer',
    body,
    labels: ['stress'],
    replies: [],
  },
]);
const { server } = require('../src/server');
(async () => {
  let browser;
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await pw.launch({
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
      viewport: { width: 1440, height: 1000 },
      colorScheme: 'dark',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.copiedLink = text;
          },
        },
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data) => {
          window.sharedStory = data;
        },
      });
      window.print = () => {
        window.printCalled = true;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const settle = async (size, pageNum) =>
      page.waitForFunction(
        ({ size, pageNum }) => {
          const g = document.querySelector('[data-post-grid]');
          return (
            g &&
            Number(g.dataset.perPage) === size &&
            (!pageNum || Number(g.dataset.page) === pageNum) &&
            !g.hasAttribute('aria-busy')
          );
        },
        { size, pageNum },
      );
    await page.goto(base);
    await settle(24, 1);
    assert.equal(await page.locator('[data-post-grid] > .card').count(), 24);
    assert.equal(
      await page.locator('.site-header a[href="/login"]').count(),
      0,
    );
    assert.equal(
      await page.locator('meta[name="robots"]').getAttribute('content'),
      'index, follow, max-image-preview:large',
    );
    await page
      .getByRole('link', { name: 'Volgende pagina', exact: true })
      .click();
    await settle(24, 2);
    assert.equal(
      await page
        .locator('[data-post-grid] > .card')
        .first()
        .getAttribute('data-story-id'),
      'post-24',
    );
    await page.goBack();
    await settle(24, 1);
    assert.equal(
      await page
        .locator('[data-post-grid] > .card')
        .first()
        .getAttribute('data-story-id'),
      'post-0',
    );
    await page
      .getByRole('link', { name: 'Volgende pagina', exact: true })
      .click();
    await settle(24, 2);
    await page.setViewportSize({ width: 2560, height: 1000 });
    await settle(36, 1);
    assert.equal(await page.locator('[data-post-grid] > .card').count(), 36);
    const preserved = await page
      .locator('[data-post-grid] > [data-story-id="post-24"]')
      .boundingBox();
    assert.ok(
      preserved.y >= 50 && preserved.y < 180,
      'Resize should keep the visible story in view: ' + preserved.y,
    );
    console.log(
      'Responsive counts, pagination, history and resize position: passed',
    );
    await page.goto(
      base + '/posts/solo?from=' + encodeURIComponent('/?page=2&perPage=24'),
    );
    await page.locator('.reading-preferences summary').click();
    const wide = await page.locator('.body').boundingBox();
    const parent = await page.locator('.story-content').boundingBox();
    assert.ok(wide.width >= parent.width - 2);
    assert.equal(
      await page.locator('.back-link').getAttribute('href'),
      '/?page=2&perPage=24',
    );
    await page.locator('[data-story-copy]').click();
    assert.equal(
      await page.evaluate(() => window.copiedLink),
      base + '/posts/solo',
    );
    assert.match(
      await page.locator('[data-action-status]').textContent(),
      /gekopieerd/,
    );
    await page.locator('[data-story-share]').click();
    assert.equal(
      await page.evaluate(() => window.sharedStory.url),
      base + '/posts/solo',
    );
    await page.locator('[data-story-print]').click();
    assert.equal(await page.evaluate(() => window.printCalled), true);
    await page.locator('select[data-reading-width]').selectOption('focused');
    assert.ok((await page.locator('.body').boundingBox()).width < wide.width);
    await page.reload();
    assert.equal(
      await page.locator('select[data-reading-width]').inputValue(),
      'focused',
    );
    await page.locator('select[data-reading-width]').selectOption('wide');
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error('Denied');
          },
        },
      }),
    );
    await page.locator('[data-story-copy]').click();
    assert.equal(await page.locator('[data-share-url]').isVisible(), true);
    assert.match(
      await page.locator('[data-action-status]').textContent(),
      /kopieer/,
    );
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('[data-story-actions]').isVisible(), false);
    assert.equal(
      await page.locator('.story').evaluate((el) => getComputedStyle(el).color),
      'rgb(0, 0, 0)',
    );
    await page.emulateMedia({ media: 'screen' });
    await page.locator('[data-info-open]').click();
    const dialog = await page.locator('dialog').boundingBox();
    await page.mouse.click(dialog.x + 3, dialog.y + 3);
    assert.equal(await page.locator('dialog').evaluate((el) => el.open), true);
    await page.mouse.click(2, 2);
    assert.equal(await page.locator('dialog').evaluate((el) => el.open), false);
    console.log(
      'Wide/focused reading, clipboard success/fallback, share, print and dialog: passed',
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base);
    await settle(24, 1);
    const failure = (url) =>
      url.pathname === '/' && url.searchParams.get('perPage') === '36';
    await page.route(failure, (route) => route.abort());
    await page.setViewportSize({ width: 2560, height: 1000 });
    await page
      .locator('.archive-status')
      .filter({ hasText: 'lukt momenteel niet' })
      .waitFor();
    assert.equal(await page.locator('[data-post-grid] > .card').count(), 24);
    await page.unroute(failure);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.setViewportSize({ width: 1920, height: 1000 });
    await settle(30, 1);
    assert.equal(await page.locator('[data-post-grid] > .card').count(), 30);
    console.log(
      'Failed adaptive fetch preserves readable content and recovers: passed',
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await settle(24, 1);
    let releaseResponse;
    let requestStarted;
    let responseHandled;
    const responseGate = new Promise((resolve) => {
      releaseResponse = resolve;
    });
    const started = new Promise((resolve) => {
      requestStarted = resolve;
    });
    const handled = new Promise((resolve) => {
      responseHandled = resolve;
    });
    const delayed = (url) =>
      url.pathname === '/' && url.searchParams.get('perPage') === '36';
    await page.route(delayed, async (route) => {
      const response = await route.fetch();
      requestStarted();
      await responseGate;
      try {
        await route.fulfill({ response });
      } catch {
        /* The client may already have aborted the obsolete request. */
      } finally {
        responseHandled();
      }
    });
    await page.setViewportSize({ width: 2560, height: 1000 });
    await within(started);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(
      () => document.querySelector('.archive-status').textContent === '',
    );
    releaseResponse();
    await within(handled);
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator('[data-post-grid]').getAttribute('data-per-page'),
      '24',
    );
    assert.equal(await page.locator('[data-post-grid] > .card').count(), 24);
    assert.equal(new URL(page.url()).searchParams.get('perPage'), '24');
    await page.unroute(delayed);
    console.log(
      'Returning to the previous width rejects a delayed resize response: passed',
    );
    let releaseNavigation;
    let navigationStarted;
    let navigationHandled;
    const navigationGate = new Promise((resolve) => {
      releaseNavigation = resolve;
    });
    const navigating = new Promise((resolve) => {
      navigationStarted = resolve;
    });
    const navigated = new Promise((resolve) => {
      navigationHandled = resolve;
    });
    const delayedNavigation = (url) =>
      url.pathname === '/' &&
      url.searchParams.get('page') === '3' &&
      url.searchParams.get('perPage') === '24';
    await page.route(delayedNavigation, async (route) => {
      const response = await route.fetch();
      navigationStarted();
      await navigationGate;
      try {
        await route.fulfill({ response });
      } catch {
        /* A resize may replace this request with an adapted page size. */
      } finally {
        navigationHandled();
      }
    });
    await page
      .locator('[data-page-select]')
      .selectOption('/?page=3&perPage=24');
    await within(navigating);
    await page.setViewportSize({ width: 1480, height: 1000 });
    await page.waitForTimeout(350);
    assert.equal(
      await page.locator('[data-post-grid]').getAttribute('aria-busy'),
      'true',
    );
    await page.setViewportSize({ width: 2560, height: 1000 });
    await settle(36, 2);
    releaseNavigation();
    await within(navigated);
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator('[data-post-grid]').getAttribute('data-per-page'),
      '36',
    );
    assert.equal(
      await page.locator('[data-post-grid]').getAttribute('data-page'),
      '2',
    );
    assert.equal(
      await page
        .locator('[data-post-grid] > [data-story-id="post-48"]')
        .count(),
      1,
    );
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    await page.unroute(delayedNavigation);
    console.log(
      'Resizing during pagination keeps the requested archive position: passed',
    );
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
