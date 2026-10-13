const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
process.env.DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/hyper-reading-ui-');
process.env.SESSION_SECRET = 'x'.repeat(32);
delete process.env.SITE_URL;
const store = require('../src/store');
const paragraphs = Array.from(
  { length: 24 },
  (_, i) =>
    `Alinea ${i + 1}. ` +
    'Dit is een bewaarde ervaring met meerdere zinnen om de leespositie op verschillende schermen te controleren. '.repeat(
      6,
    ),
);
store.saveAdmin('admin', 'safe-password');
store.savePosts(
  Array.from({ length: 40 }, (_, i) => ({
    id: `story-${i}`,
    title: `Verhaal ${String(i).padStart(2, '0')}`,
    author: 'Archiefnaam',
    body: paragraphs.join('\n\n'),
    labels: ['ademhaling', 'onrust'],
    replies: [
      {
        id: 'reply',
        author: 'Andere naam',
        body: 'Een gearchiveerde reactie.',
      },
    ],
  })),
);
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
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const readRequests = [];
    context.on('request', (request) => {
      if (/\/posts\/[^/]+\/read$/.test(request.url()))
        readRequests.push(request.url());
    });
    await page.goto(base);
    assert.equal(await page.locator('[data-bookmark]').count(), 0);
    assert.equal(await page.locator('[data-personal-shelf]').count(), 0);
    await page.locator('[data-consent-reject]').click();
    await page.goto(base + '/posts/story-0');
    assert.equal(
      await page.locator('.reading-preferences').evaluate((el) => el.open),
      false,
    );
    await page.locator('.reading-preferences summary').click();
    for (const selector of [
      '[data-bookmark]',
      '[data-focus-toggle]',
      '[data-story-share]',
      '[data-story-copy]',
      '[data-story-print]',
    ]) {
      assert.equal(
        await page.locator('.reading-preferences ' + selector).count(),
        1,
      );
    }
    assert.equal(
      await page
        .locator(
          'progress, [data-progress-toggle], [data-story-resume], .reader-toolbar',
        )
        .count(),
      0,
    );
    await page.locator('[data-bookmark]').click();
    await page.reload();
    assert.equal(
      await page.locator('.reading-preferences').evaluate((el) => el.open),
      true,
    );
    assert.equal(
      await page.locator('[data-bookmark]').getAttribute('aria-pressed'),
      'true',
    );
    const otherTab = await context.newPage();
    await otherTab.goto(base + '/posts/story-0');
    await otherTab.locator('.reading-preferences summary').click();
    await otherTab.locator('[data-bookmark]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-bookmark]')
          .getAttribute('aria-pressed') === 'false',
    );
    await otherTab.locator('[data-bookmark]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-bookmark]')
          .getAttribute('aria-pressed') === 'true',
    );
    await otherTab.close();
    await page.locator('select[data-reading-width]').selectOption('focused');
    await page.locator('[data-focus-toggle]').click();
    assert.equal(await page.locator('.site-header').isVisible(), false);
    await page.keyboard.press('Escape');
    assert.equal(
      await page.locator('[data-focus-toggle]').getAttribute('aria-pressed'),
      'false',
    );
    await page.locator('.reading-preferences summary').click();
    await page.reload();
    assert.equal(
      await page.locator('.reading-preferences').evaluate((el) => el.open),
      false,
    );
    await page.setViewportSize({ width: 390, height: 850 });
    await page.reload();
    assert.equal(
      await page.locator('.reading-preferences').evaluate((el) => el.open),
      false,
    );
    await page.locator('.reading-preferences summary').click();
    await page.reload();
    assert.equal(
      await page.locator('.reading-preferences').evaluate((el) => el.open),
      true,
    );
    assert.equal(
      await page.locator('select[data-reading-width]').inputValue(),
      'focused',
    );
    await page.locator('.body p').nth(12).scrollIntoViewIfNeeded();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('hyperpedia-reading-v2')),
    );
    assert.deepEqual(Object.keys(saved).sort(), ['saved', 'version']);
    assert.deepEqual(Object.keys(saved.saved[0]).sort(), [
      'id',
      'savedAt',
      'title',
    ]);
    assert.equal(
      readRequests.length,
      0,
      'No counter requests before statistics consent',
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('hyperpedia-preferences-v1'),
      ),
      null,
    );
    await page.goto(base + '/leeslijst');
    await page.locator('[data-saved-list] a').waitFor();
    assert.match(
      await page.locator('[data-library-note]').textContent(),
      /browser en dit browserprofiel/,
    );
    assert.equal(await page.locator('[data-continue-list]').count(), 0);
    assert.equal(
      await page.locator('[data-saved-list] a').getAttribute('href'),
      '/posts/story-0',
    );
    await page.goto(base + '/privacy');
    await page.locator('[name="preferences"]').check();
    await page.getByRole('button', { name: 'Keuze opslaan' }).click();
    const choice = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('hyperpedia-consent-v1')),
    );
    assert.equal(choice.expiresAt - choice.decidedAt, 365 * 24 * 3600 * 1000);
    assert.equal(choice.preferences, true);
    assert.equal(choice.statistics, false);
    const fresh = await context.newPage();
    await fresh.goto(base + '/posts/story-0');
    assert.equal(
      await fresh.locator('.reading-preferences').evaluate((el) => el.open),
      true,
    );
    assert.equal(
      await fresh.locator('[data-consent-banner]').isVisible(),
      false,
    );
    const counted = fresh.waitForRequest((request) =>
      /\/posts\/story-0\/read$/.test(request.url()),
    );
    await page.locator('[name="statistics"]').check();
    await page.getByRole('button', { name: 'Keuze opslaan' }).click();
    await counted;
    await page.getByRole('button', { name: 'Alles weigeren' }).click();
    await fresh.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('hyperpedia-consent-v1')).statistics ===
        false,
    );
    const afterRevocation = readRequests.length;
    await fresh.goto(base + '/posts/story-1');
    assert.equal(readRequests.length, afterRevocation);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('hyperpedia-preferences-v1'),
      ),
      null,
    );
    await fresh.close();
    // Upgrade preserves bookmarks but removes all retired history data.
    await page.evaluate(() => {
      localStorage.removeItem('hyperpedia-reading-v2');
      localStorage.setItem(
        'hyperpedia-reading-v1',
        JSON.stringify({
          version: 1,
          saved: [
            { id: 'story-3', title: '<img src=x onerror=alert(1)>' },
            { id: 'deleted', title: 'Verwijderd verhaal' },
          ],
          history: [
            { id: 'story-3', ratio: 0.5, block: 12, updatedAt: Date.now() },
          ],
        }),
      );
    });
    await page.goto(base + '/leeslijst');
    await page.locator('[data-saved-list] a').waitFor();
    assert.equal(
      await page.evaluate(() => localStorage.getItem('hyperpedia-reading-v1')),
      null,
    );
    assert.equal(await page.locator('[data-saved-list] img').count(), 0);
    assert.match(
      await page.locator('[data-saved-list]').textContent(),
      /niet meer beschikbaar/,
    );
    assert.equal(
      await page.evaluate(() =>
        Object.hasOwn(
          JSON.parse(localStorage.getItem('hyperpedia-reading-v2')),
          'history',
        ),
      ),
      false,
    );
    await page.locator('[data-clear-library]').click();
    await page.locator('[data-cancel-clear]').click();
    assert.equal(await page.locator('[data-remove-bookmark]').count(), 2);
    await page.locator('[data-clear-library]').click();
    await page.locator('[data-confirm-clear]').click();
    assert.equal(await page.locator('[data-remove-bookmark]').count(), 0);
    const independent = await browser.newContext();
    const independentPage = await independent.newPage();
    await independentPage.goto(base + '/leeslijst');
    await independentPage.locator('[data-library-controls]').waitFor();
    assert.equal(
      await independentPage.locator('[data-remove-bookmark]').count(),
      0,
    );
    await independent.close();
    // Expired consent and bookmarks are purged; optional features stay off.
    await page.evaluate(() => {
      const year = 365 * 24 * 3600 * 1000;
      const decidedAt = Date.now() - year - 1000;
      localStorage.setItem(
        'hyperpedia-consent-v1',
        JSON.stringify({
          version: 1,
          preferences: true,
          statistics: true,
          decidedAt,
          expiresAt: decidedAt + year,
        }),
      );
      localStorage.setItem(
        'hyperpedia-preferences-v1',
        JSON.stringify({ theme: 'dark' }),
      );
      localStorage.setItem(
        'hyperpedia-reading-v2',
        JSON.stringify({
          version: 2,
          saved: [{ id: 'story-0', title: 'Verhaal 00', savedAt: decidedAt }],
        }),
      );
    });
    await page.goto(base + '/leeslijst');
    await page.locator('[data-library-controls]').waitFor();
    assert.equal(await page.locator('[data-remove-bookmark]').count(), 0);
    assert.equal(await page.locator('[data-consent-banner]').isVisible(), true);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem('hyperpedia-preferences-v1'),
      ),
      null,
    );
    await page.locator('[data-consent-reject]').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    console.log(
      'Unified controls, disclosure persistence, bookmarks, consent, expiry, migration and clearing: passed',
    );
    const routeUrl = (
      await (await page.request.get(base + '/leesroutes')).text()
    ).match(/class="path-card" href="([^"]+)"/)[1];
    const paths = [
      '/',
      '/posts/story-0',
      '/leeslijst',
      '/leesroutes',
      routeUrl,
      '/bronvermelding/story-0',
      '/login',
      '/privacy',
    ];
    for (const width of [320, 390, 650, 768, 1024, 1440, 1920, 2560, 3440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const path of paths) {
        await page.goto(base + path);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `${path} overflows at ${width}px`,
        );
      }
    }
    await page.goto(base + '/login');
    await page.locator('input[name="username"]').fill('admin');
    await page.locator('input[name="password"]').fill('safe-password');
    await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
    await page.waitForURL('**/admin');
    const id = routeUrl.split('/').pop();
    for (const width of [320, 390, 768, 1440, 2560]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/admin/leesroutes?id=${id}`);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        `Editor overflows at ${width}px`,
      );
    }
    await page.locator('input[name="title"]').fill('Mijn selectie');
    await page.locator('select[name="post1"]').selectOption('story-5');
    await page.locator('select[name="post2"]').selectOption('story-3');
    await page.locator('select[name="post3"]').selectOption('story-1');
    await page.locator('select[name="post4"]').selectOption('');
    await page.locator('select[name="post5"]').selectOption('');
    await page.getByRole('button', { name: 'Leesroute opslaan' }).click();
    await page.waitForURL('**/admin/leesroutes?id=*');
    await page.goto(base + routeUrl);
    assert.equal(
      await page.locator('.path-stories h2').first().textContent(),
      'Verhaal 05',
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base + '/leesroutes');
    assert.equal(
      await page
        .locator('.path-card')
        .first()
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      '0s',
    );
    assert.equal(
      await page
        .locator('.path-card')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
      'none',
    );
    console.log(
      'Nine responsive widths, author pages, route editor and reduced motion: passed',
    );
    assert.deepEqual(errors, []);
    const blocked = await browser.newContext({
      viewport: { width: 390, height: 850 },
    });
    await blocked.addInitScript(() => {
      for (const name of ['localStorage', 'sessionStorage'])
        Object.defineProperty(window, name, {
          get() {
            throw new Error('Blocked');
          },
        });
    });
    const blockedPage = await blocked.newPage();
    blockedPage.on('pageerror', (error) => errors.push(error.message));
    await blockedPage.goto(base + '/posts/story-0');
    await blockedPage.locator('[data-consent-reject]').click();
    await blockedPage.locator('.reading-preferences summary').click();
    await blockedPage.locator('[data-bookmark]').click();
    assert.equal(
      await blockedPage.locator('[data-bookmark]').getAttribute('aria-pressed'),
      'true',
    );
    assert.match(
      await blockedPage.locator('[data-reading-status]').textContent(),
      /alleen op deze pagina/,
    );
    await blockedPage.locator('[data-focus-toggle]').click();
    assert.equal(
      await blockedPage
        .locator('[data-focus-toggle]')
        .getAttribute('aria-pressed'),
      'true',
    );
    await blockedPage.keyboard.press('Escape');
    await blockedPage.goto(base + '/privacy');
    await blockedPage.locator('[data-consent-reject]').first().click();
    assert.match(
      await blockedPage.locator('[data-privacy-status]').textContent(),
      /alleen voor deze pagina/,
    );
    assert.deepEqual(errors, []);
    await blocked.close();
    const plain = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 850 },
    });
    const plainPage = await plain.newPage();
    await plainPage.goto(base + '/posts/story-0');
    assert.ok(
      (await plainPage.locator('.body').textContent()).includes('Alinea 24'),
    );
    assert.equal(await plainPage.locator('[data-bookmark]').isVisible(), false);
    assert.equal(
      await plainPage.locator('[data-consent-banner]').isVisible(),
      false,
    );
    await plainPage.goto(base + routeUrl);
    assert.equal(await plainPage.locator('.path-number').count(), 3);
    await plainPage.goto(base + '/privacy');
    assert.match(
      await plainPage.locator('noscript').textContent(),
      /JavaScript is uitgeschakeld/,
    );
    console.log('Unavailable storage and no-JavaScript reading: passed');
    await plain.close();
    await context.close();
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
