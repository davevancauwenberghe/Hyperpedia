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
    await page.goto(base);
    await page.waitForFunction(
      () => document.querySelector('[data-post-grid]').dataset.perPage === '24',
    );
    await page.locator('[data-post-grid] [data-bookmark="story-0"]').click();
    await page.setViewportSize({ width: 2560, height: 1000 });
    await page.waitForFunction(
      () => document.querySelector('[data-post-grid]').dataset.perPage === '36',
    );
    assert.equal(
      await page
        .locator('[data-post-grid] [data-bookmark="story-0"]')
        .getAttribute('aria-pressed'),
      'true',
    );
    const otherTab = await context.newPage();
    await otherTab.goto(base + '/posts/story-2');
    await otherTab.locator('[data-bookmark]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-post-grid] [data-bookmark="story-2"]')
          .getAttribute('aria-pressed') === 'true',
    );
    await otherTab.locator('[data-bookmark]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-post-grid] [data-bookmark="story-2"]')
          .getAttribute('aria-pressed') === 'false',
    );
    await otherTab.close();
    await page.goto(base + '/leeslijst');
    await page.locator('[data-saved-list] a').waitFor();
    assert.equal(
      await page.locator('[data-saved-list] a').textContent(),
      'Verhaal 00',
    );
    await page.goto(base + '/posts/story-0');
    const block = page.locator('.body [data-reading-block]').nth(9);
    await block.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const value = JSON.parse(
        localStorage.getItem('hyperpedia-reading-v1') || 'null',
      );
      return value?.history.some(
        (entry) =>
          entry.id === 'story-0' && entry.ratio > 0.05 && entry.ratio < 0.95,
      );
    });
    const before = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('hyperpedia-reading-v1')).history[0],
    );
    await page.goto(base);
    assert.equal(await page.locator('[data-personal-shelf]').isVisible(), true);
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.locator('[data-resume-link]').click();
    await page.waitForFunction(() => window.scrollY > 300);
    const restored = await page
      .locator('.story-content [data-reading-block]')
      .nth(before.block)
      .boundingBox();
    const line = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--reader-scroll-offset',
        ),
      ),
    );
    assert.ok(
      Math.abs(restored.y + restored.height * before.offset - line) < 5,
      'Saved text position should survive a viewport change: ' +
        JSON.stringify({
          before,
          restored,
          line,
          stored: await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('hyperpedia-reading-v1'))
                .history[0],
          ),
        }),
    );
    const originalText = await page.locator('.story-content').textContent();
    await page.locator('[data-focus-toggle]').click();
    assert.equal(await page.locator('.site-header').isVisible(), false);
    assert.equal(await page.locator('.story-sidebar').isVisible(), false);
    assert.equal(
      await page.locator('.story-content').textContent(),
      originalText,
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.site-header').isVisible(), true);
    await page.locator('[data-focus-toggle]').click();
    await page.reload();
    assert.equal(
      await page.locator('[data-focus-toggle]').getAttribute('aria-pressed'),
      'true',
    );
    await page.keyboard.press('Escape');
    await page.locator('.reading-preferences summary').click();
    await page.locator('[data-progress-toggle]').uncheck();
    assert.equal(await page.locator('[data-progress-area]').isVisible(), false);
    await page.reload();
    assert.equal(await page.locator('[data-progress-area]').isVisible(), false);
    await page.locator('.reading-preferences summary').click();
    await page.locator('[data-progress-toggle]').check();
    await page.locator('.reader-jumps a[href="#replies-title"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#replies-title').getBoundingClientRect().top <
        500,
    );
    await page.goto(base + '/leesroutes');
    await page.locator('.path-card').first().click();
    assert.equal(await page.locator('.path-number').count(), 5);
    await page.getByRole('link', { name: 'Begin de leesroute' }).click();
    assert.ok(await page.locator('.path-context').isVisible());
    await page.getByRole('link', { name: 'Volgend verhaal' }).click();
    assert.ok(
      (await page.locator('.path-context').textContent()).includes('2 van 5'),
    );
    await page.goto(base + '/leeslijst');
    await page.locator('[data-library-controls]').waitFor();
    await page.locator('[data-clear-library]').click();
    await page.locator('[data-cancel-clear]').click();
    assert.equal(await page.locator('[data-saved-list] a').count(), 1);
    await page.locator('[data-clear-library]').click();
    await page.locator('[data-confirm-clear]').click();
    assert.equal(await page.locator('[data-saved-list] a').count(), 0);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('hyperpedia-reading-v1')).history
            .length,
      ),
      0,
    );
    console.log(
      'Bookmarks, responsive hydration, library, resume, focus, progress, routes and clearing: passed',
    );
    // Hostile or corrupt local metadata must stay plain text and bounded.
    await page.evaluate(() =>
      localStorage.setItem(
        'hyperpedia-reading-v1',
        JSON.stringify({
          version: 1,
          saved: [{ id: 'missing', title: '<img src=x onerror=alert(1)>' }],
          history: [{ id: 'bad', ratio: 'invalid' }],
        }),
      ),
    );
    await page.reload();
    await page.locator('[data-library-controls]').waitFor();
    assert.equal(await page.locator('[data-saved-list] img').count(), 0);
    assert.ok(
      (await page.locator('[data-saved-list]').textContent()).includes(
        'niet meer beschikbaar',
      ),
    );
    await page.locator('[data-remove-bookmark]').click();
    assert.equal(await page.locator('[data-remove-bookmark]').count(), 0);
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
    await blocked.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Blocked');
        },
      }),
    );
    const blockedPage = await blocked.newPage();
    blockedPage.on('pageerror', (error) => errors.push(error.message));
    await blockedPage.goto(base);
    await blockedPage
      .locator('[data-post-grid] [data-bookmark="story-0"]')
      .click();
    assert.equal(
      await blockedPage.locator('[data-reading-toast]').isVisible(),
      true,
    );
    assert.ok(
      (
        await blockedPage.locator('[data-global-reading-status]').textContent()
      ).includes('alleen op deze pagina'),
    );
    await blockedPage.locator('[data-reading-toast-close]').click();
    assert.equal(
      await blockedPage.locator('[data-reading-toast]').isVisible(),
      false,
    );
    await blockedPage.goto(base + '/posts/story-0');
    await blockedPage.locator('[data-bookmark]').click();
    assert.equal(
      await blockedPage.locator('[data-bookmark]').getAttribute('aria-pressed'),
      'true',
    );
    assert.ok(
      (
        await blockedPage.locator('[data-reading-status]').textContent()
      ).includes('alleen op deze pagina'),
    );
    await blockedPage.locator('[data-focus-toggle]').click();
    assert.equal(
      await blockedPage
        .locator('[data-focus-toggle]')
        .getAttribute('aria-pressed'),
      'true',
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
    await plainPage.goto(base + routeUrl);
    assert.equal(await plainPage.locator('.path-number').count(), 3);
    console.log(
      'Unsafe local metadata, unavailable storage and no-JavaScript reading: passed',
    );
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
