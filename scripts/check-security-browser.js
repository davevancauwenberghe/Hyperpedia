const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
process.env.DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/hyper-security-browser-');
process.env.SESSION_SECRET = 'browser-security-fixture-'.repeat(3);
delete process.env.SITE_URL;
const store = require('../src/store');
store.savePosts(
  Array.from({ length: 63 }, (_, index) => ({
    id: 'post-' + index,
    title: 'Verhaal ' + String(index).padStart(3, '0'),
    author: 'Lezer',
    body: 'Een ervaring met spanning en ademhaling. '.repeat(15),
    labels: ['stress'],
  })),
);
const { server } = require('../src/server');
(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.BROWSER_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        window.cspViolations.push(event.violatedDirective),
      );
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let homepageRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/') homepageRequests++;
    });
    // Exercise the suggested report-only rollout before testing enforcement.
    process.env.CSP_REPORT_ONLY = 'true';
    let response = await page.goto(base);
    assert.ok(response.headers()['content-security-policy-report-only']);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-post-grid]') &&
        !document.querySelector('[data-post-grid]').hasAttribute('aria-busy'),
    );
    assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    delete process.env.CSP_REPORT_ONLY;
    for (const [width, size] of [
      [390, 6],
      [1000, 12],
      [1440, 24],
      [2560, 36],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      homepageRequests = 0;
      response = await page.goto(base);
      assert.ok(response.headers()['content-security-policy']);
      await page.waitForFunction(
        (expected) =>
          Number(document.querySelector('[data-post-grid]').dataset.perPage) === expected,
        size,
      );
      assert.equal(await page.locator('[data-post-grid] > .card').count(), size);
      assert.equal(homepageRequests, 1, 'Initial adaptation must not fetch the homepage twice');
      assert.equal(new URL(page.url()).search, '');
      assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    }
    await page.locator('[data-consent-reject]').click();
    const picker = page.locator('[data-page-select]');
    await picker.focus();
    const before = page.url();
    await picker.press('ArrowDown');
    assert.equal(page.url(), before);
    assert.equal(await picker.inputValue(), '2');
    await picker.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('[data-post-grid]').dataset.page === '2',
    );
    assert.equal(
      await page.locator('[data-post-grid] > .card').first().getAttribute('data-story-id'),
      'post-36',
    );
    assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    await page.goto(base + '/posts/post-0');
    assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    assert.ok(await page.locator('script[type="application/ld+json"]').count());
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.untrustedScriptRan = true';
      document.body.append(script);
    });
    await page.waitForFunction(() => window.cspViolations.length > 0);
    assert.equal(await page.evaluate(() => window.untrustedScriptRan), undefined);
    assert.deepEqual(errors, []);
    await context.close();
    const plain = await browser.newContext({ javaScriptEnabled: false });
    const plainPage = await plain.newPage();
    await plainPage.goto(base);
    await plainPage.locator('[data-page-select]').selectOption('2');
    assert.equal(new URL(plainPage.url()).search, '');
    await plainPage.getByRole('button', { name: 'Ga', exact: true }).click();
    await plainPage.waitForURL(base + '/?page=2');
    assert.equal(
      await plainPage.locator('[data-post-grid] > .card').first().getAttribute('data-story-id'),
      'post-18',
    );
    await plain.close();
    console.log(
      'CSP report-only/enforcement, blocked inline code, single-request responsive layouts and explicit keyboard/no-JS pagination: passed',
    );
  } finally {
    delete process.env.CSP_REPORT_ONLY;
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
