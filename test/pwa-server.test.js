const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('public SEO, app assets and machine discovery preserve canonical stories and private views', async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-pwa-'));
  process.env.SESSION_SECRET = 'x'.repeat(32);
  process.env.PRIVACY_CONTROLLER = 'Dave Van Cauwenberghe';
  process.env.PRIVACY_CONTACT_URL = 'https://www.davevancauwenberghe.be/contact/';
  delete process.env.SITE_URL;
  const store = require('../src/store');
  store.savePosts([
    {
      id: 'story',
      title: 'Een ervaring',
      author: 'Archiefnaam',
      body: 'Het originele verhaal.',
      labels: ['onrust'],
      created_at: '2020-09-02T12:00:00Z',
      replies: [
        {
          id: 'reply',
          author: 'Andere naam',
          body: 'Een reactie.',
          created_at: '2020-09-03T12:00:00Z',
        },
        {
          id: 'legacy /é%#"',
          author: 'Oude archiefnaam',
          body: 'Een reactie met een geïmporteerde identifier.',
        },
      ],
    },
  ]);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const manifest = await (await fetch(base + '/site.webmanifest')).json();
    assert.equal(manifest.id, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.orientation, 'any');
    assert.equal(manifest.prefer_related_applications, false);
    assert.deepEqual(
      manifest.shortcuts.map((item) => item.url),
      ['/leesroutes', '/leeslijst'],
    );
    for (const icon of manifest.icons.filter((icon) => icon.purpose === 'maskable')) {
      const response = await fetch(base + icon.src);
      assert.equal(response.headers.get('content-type'), 'image/png');
      const data = Buffer.from(await response.arrayBuffer());
      const size = Number(icon.sizes.split('x')[0]);
      assert.equal(data.readUInt32BE(16), size);
      assert.equal(data.readUInt32BE(20), size);
      assert.equal(data[25], 2, 'App icon must be opaque RGB');
    }
    const touch = Buffer.from(await (await fetch(base + '/apple-touch-icon.png')).arrayBuffer());
    assert.equal(touch[25], 2);
    const worker = await fetch(base + '/sw.js');
    assert.equal(worker.headers.get('cache-control'), 'no-cache');
    assert.equal(worker.headers.get('service-worker-allowed'), '/');
    assert.equal(
      (await fetch(base + '/offline.html')).headers.get('x-robots-tag'),
      'noindex, nofollow',
    );
    const guide = await fetch(base + '/llms.txt');
    assert.match(guide.headers.get('content-type'), /text\/plain; charset=utf-8/);
    assert.match(await guide.text(), /\[onrust\]/);
    assert.equal((await fetch(base + '/llms.txt', { method: 'HEAD' })).status, 200);
    const privacy = await (await fetch(base + '/privacy')).text();
    assert.match(privacy, /Dave Van Cauwenberghe/);
    assert.match(privacy, /https:\/\/www.davevancauwenberghe.be\/contact\//);
    assert.match(privacy, /Cloudflare verwerkt als verwerker/);
    assert.match(privacy, /Contabo verzorgt de hosting/);
    assert.match(privacy, /actuele termijn/);
    process.env.PRIVACY_LOG_RETENTION_DAYS = '14';
    assert.match(await (await fetch(base + '/privacy')).text(), /ongeveer 14 dagen/);
    delete process.env.PRIVACY_LOG_RETENTION_DAYS;
    const html = await (await fetch(base + '/posts/story?from=selection')).text();
    assert.match(html, /apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /max-image-preview:large/);
    const imageHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(__dirname, '../public/social-preview.png')))
      .digest('base64url');
    assert.ok(html.includes(`${base}/social-preview.png?v=${imageHash}`));
    assert.match(html, /og:url" content="[^"?]+\/posts\/story"/);
    assert.match(html, /rel="describedby"/);
    const schema = JSON.parse(html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.datePublished, '2020-09-02T12:00:00.000Z');
    assert.equal(schema.image, undefined);
    assert.equal(schema.comment[0].url, base + '/posts/story#reply-id-reply');
    assert.ok(html.includes('id="reply-id-reply"'));
    for (const reply of schema.comment) {
      const url = new URL(reply.url);
      const target = decodeURIComponent(url.hash.slice(1));
      assert.ok(html.includes(`id="${target}"`), 'Reply URL must target the rendered reply');
      const attribution = await (await fetch(reply.author.url)).text();
      assert.ok(attribution.includes(`href="${url.pathname}${url.hash}"`));
    }
    assert.equal((await fetch(schema.author.url)).status, 200);
    const xml = await (await fetch(base + '/sitemap.xml')).text();
    assert.doesNotMatch(xml, /offline|privacy|llms.txt|leeslijst/);
    const compose = fs.readFileSync(path.join(__dirname, '../compose.yaml'), 'utf8');
    assert.match(compose, /PRIVACY_CONTROLLER: Dave Van Cauwenberghe/);
    assert.match(compose, /PRIVACY_CONTACT_URL: https:\/\/www.davevancauwenberghe.be\/contact\//);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  }
});
