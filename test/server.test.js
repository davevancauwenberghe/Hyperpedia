const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const APP_VERSION = require('../package.json').version;

test('server module loads without a configured session secret', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      "delete process.env.SESSION_SECRET; process.env.DATA_DIR = process.argv[1]; require('./src/server');",
      dir,
    ],
    {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /using an ephemeral session secret/);
});

test('admin can add a reply to a post', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('beheerder', 'een-veilig-wachtwoord');
  store.savePosts([
    { id: 'post-1', author: 'Originele naam', title: 'Titel', body: 'Tekst', labels: [] },
  ]);
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'beheerder', password: 'een-veilig-wachtwoord' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];

    const reply = await fetch(`${base}/admin/reply/post-1`, {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({
        originalReplier: 'Originele naam',
        author: 'Beheerder',
        body: 'Bedankt voor je verhaal.',
      }),
      redirect: 'manual',
    });

    assert.equal(reply.status, 302);
    assert.equal(reply.headers.get('location'), '/posts/post-1');
    assert.deepEqual(
      store
        .allPosts()[0]
        .replies.map(({ originalReplier, author, body }) => ({ originalReplier, author, body })),
      [
        {
          originalReplier: 'Originele naam',
          author: 'Beheerder',
          body: 'Bedankt voor je verhaal.',
        },
      ],
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('homepage search includes replies', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts([
    {
      id: 'post-1',
      author: 'Originele naam',
      title: 'Titel zonder zoekwoord',
      body: 'Tekst zonder zoekwoord',
      labels: [],
      replies: [
        {
          id: 'reply-1',
          originalReplier: 'Originele naam',
          author: 'Beheerder',
          body: 'Kalmerend antwoord over kaakspanning.',
        },
      ],
    },
  ]);
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/?q=kaakspanning`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Titel zonder zoekwoord/);
    assert.doesNotMatch(html, /Nog geen verhalen gevonden/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admin can edit and delete a reply', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('beheerder', 'een-veilig-wachtwoord');
  store.savePosts([
    {
      id: 'post-1',
      author: 'Originele naam',
      title: 'Titel',
      body: 'Tekst',
      labels: [],
      replies: [
        {
          id: 'reply-1',
          originalReplier: 'Originele naam',
          author: 'Beheerder',
          body: 'Eerste reactie.',
        },
      ],
    },
  ]);
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'beheerder', password: 'een-veilig-wachtwoord' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];

    const editor = await (
      await fetch(`${base}/admin/reply/post-1/reply-1/edit`, { headers: { cookie } })
    ).text();
    const revision = editor.match(/name="revision" value="([^"]+)"/)[1];
    const edit = await fetch(`${base}/admin/reply/post-1/reply-1/edit`, {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({
        originalReplier: 'Aangepaste naam',
        author: 'Moderator',
        body: 'Bijgewerkte reactie.',
        revision,
      }),
      redirect: 'manual',
    });

    assert.equal(edit.status, 302);
    assert.equal(edit.headers.get('location'), '/posts/post-1');
    assert.deepEqual(
      store
        .allPosts()[0]
        .replies.map(({ originalReplier, author, body }) => ({ originalReplier, author, body })),
      [{ originalReplier: 'Aangepaste naam', author: 'Moderator', body: 'Bijgewerkte reactie.' }],
    );

    const latest = await (
      await fetch(`${base}/admin/reply/post-1/reply-1/edit`, { headers: { cookie } })
    ).text();
    const remove = await fetch(`${base}/admin/reply/post-1/reply-1/delete`, {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({ revision: latest.match(/name="revision" value="([^"]+)"/)[1] }),
      redirect: 'manual',
    });

    assert.equal(remove.status, 302);
    assert.equal(remove.headers.get('location'), '/posts/post-1');
    assert.deepEqual(store.allPosts()[0].replies, []);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('post reads are counted only by explicit open tracking and surfaced in the admin metrics overview', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('beheerder', 'een-veilig-wachtwoord');
  store.savePosts([
    {
      id: 'post-1',
      author: 'Originele naam',
      title: 'Titel',
      body: 'Tekst',
      labels: [],
      replies: [],
    },
  ]);
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fetch(`${base}/posts/post-1`);
    const consent = { origin: base, 'x-hyperpedia-consent': 'statistics' };
    await fetch(`${base}/posts/post-1/read`, { method: 'POST', headers: consent });
    await fetch(`${base}/posts/post-1/read`, { method: 'POST', headers: consent });

    const login = await fetch(`${base}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'beheerder', password: 'een-veilig-wachtwoord' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const admin = await fetch(`${base}/admin`, { headers: { cookie } });
    const html = await admin.text();

    assert.equal(admin.status, 200);
    assert.match(html, /Gelezen posts/);
    assert.match(html, /Ingevoerde posts/);
    assert.match(html, /Reacties/);
    assert.match(html, /Leesstatistieken/);
    assert.match(html, /Reads per post/);
    assert.match(html, /<span>1<\/span><p>Gelezen posts/);
    assert.match(html, /<span>1<\/span><p>Ingevoerde posts/);
    assert.match(html, /<meter min="0" max="1" value="1"><\/meter><strong>1<\/strong>/);
    assert.equal(fs.existsSync(path.join(dir, 'hyperpedia-read-metrics.json')), false);
    assert.equal(store.getStats().postReads[0].read_count, 1);
    store.flushReadMetrics();
    const metrics = JSON.parse(
      fs.readFileSync(path.join(dir, 'hyperpedia-read-metrics.json'), 'utf8'),
    );
    assert.equal(metrics.posts['post-1'].read_count, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('homepage cards and Burnout Insight CTA include explicit action links', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts([
    {
      id: 'post-1',
      author: 'Originele naam',
      title: 'Titel',
      body: 'Tekst',
      labels: [],
      replies: [],
    },
  ]);
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Lees verder/);
    assert.match(html, /aria-label="Lees verder: Titel"/);
    assert.match(html, /Nieuwe vragen stellen/);
    assert.match(html, /https:\/\/www\.burnoutinsight\.com/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('login page uses the landing page hero treatment', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/login`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /class="login-hero"/);
    assert.match(html, /class="login-card stack"/);
    assert.match(html, /Hyperpedia-archief aan te vullen/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('homepage paginates forum posts in groups of eighteen', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts(
    Array.from({ length: 19 }, (_, index) => ({
      id: `post-${String(index + 1).padStart(2, '0')}`,
      author: 'Originele naam',
      title: `Post ${String(index + 1).padStart(2, '0')}`,
      body: 'Tekst',
      labels: [],
      replies: [],
    })),
  );
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const firstPage = await fetch(base);
    const firstHtml = await firstPage.text();
    const secondPage = await fetch(`${base}/?page=2`);
    const secondHtml = await secondPage.text();

    assert.equal(firstPage.status, 200);
    assert.match(firstHtml, /Post 18/);
    assert.doesNotMatch(
      firstHtml.match(/<section class="stories-index"[\s\S]*?<\/section>/)[0],
      /Post 19/,
    );
    assert.match(firstHtml, /Pagina 1 van 2/);
    assert.match(firstHtml, /href="\/\?page=2"/);

    assert.equal(secondPage.status, 200);
    assert.doesNotMatch(
      secondHtml.match(/<section class="stories-index"[\s\S]*?<\/section>/)[0],
      /Post 18/,
    );
    assert.match(secondHtml, /Post 19/);
    assert.match(secondHtml, /Pagina 2 van 2/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('server defaults to eighteen-story pages and offers direct page selection', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts(
    Array.from({ length: 37 }, (_, index) => ({
      id: `post-${String(index + 1).padStart(2, '0')}`,
      author: 'Naam',
      title: `Post ${String(index + 1).padStart(2, '0')}`,
      body: 'Tekst',
      labels: [],
      replies: [],
    })),
  );
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(base);
    const html = await response.text();
    const stories = html.match(/<section class="stories-index"[\s\S]*?<\/section>/)[0];
    const legacy = await fetch(`${base}/?label=ademhaling&perPage=18`, { redirect: 'manual' });

    assert.equal(response.status, 200);
    assert.equal((stories.match(/<article class="card"[^>]*>/g) || []).length, 18);
    assert.match(stories, /Post 18/);
    assert.doesNotMatch(stories, /Post 19/);
    assert.match(html, /data-page-select/);
    assert.match(html, /<option value="2">Pagina 2 van 3<\/option>/);
    assert.equal(legacy.status, 308);
    assert.equal(legacy.headers.get('location'), '/?label=ademhaling');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('pagination shows a moving window of no more than three pages', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts(
    Array.from({ length: 80 }, (_, index) => ({
      id: `post-${index}`,
      author: 'Naam',
      title: `Titel ${index}`,
      body: 'Tekst',
      labels: [],
      replies: [],
    })),
  );
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const html = await (await fetch(`http://127.0.0.1:${server.address().port}/?page=3`)).text();
    assert.deepEqual(
      [...html.matchAll(/class="(?:page-link|page-current)"[^>]*>(\d+)</g)].map(
        (match) => match[1],
      ),
      ['2', '3', '4'],
    );
    assert.doesNotMatch(html, /class="page-link"[^>]*>5</);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('selected homepage label is highlighted and links back to all posts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  require('../src/store').savePosts([
    { id: '1', author: 'Naam', title: 'Titel', body: 'Tekst', labels: ['ademhaling'], replies: [] },
  ]);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const html = await (
      await fetch(`http://127.0.0.1:${server.address().port}/?label=ademhaling`)
    ).text();
    assert.match(html, /class="label selected" href="\/" aria-current="true">ademhaling/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('login blocks an address for sixty seconds after two failed attempts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  require('../src/store').saveAdmin('beheerder', 'goed-wachtwoord');
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/login`;
  const options = {
    method: 'POST',
    body: new URLSearchParams({ username: 'beheerder', password: 'fout' }),
  };
  try {
    const first = await fetch(url, options);
    const second = await fetch(url, options);
    assert.equal(first.status, 401);
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('retry-after'), '60');
    assert.match(await second.text(), /role="alert"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('login failures reset after a lock or inactive attempt expires', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  require('../src/store').saveAdmin('beheerder', 'goed-wachtwoord');
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/login`;
  const originalDateNow = Date.now;
  let now = originalDateNow();
  Date.now = () => now;
  const fail = () =>
    fetch(url, {
      method: 'POST',
      body: new URLSearchParams({ username: 'beheerder', password: 'fout' }),
    });
  try {
    assert.equal((await fail()).status, 401);
    assert.equal((await fail()).status, 429);

    now += 60_001;
    assert.equal((await fail()).status, 401);

    now += 15 * 60_000 + 1;
    assert.equal((await fail()).status, 401);
  } finally {
    Date.now = originalDateNow;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('homepage combines the calm hero with manually controlled stories of the day', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts(
    Array.from({ length: 6 }, (_, index) => ({
      id: `post-${index + 1}`,
      author: 'Originele naam',
      title: `Dagverhaal ${index + 1}`,
      body: 'Tekst',
      labels: [],
      replies: [],
    })),
  );
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /class="hero home-hero"/);
    assert.match(html, /class="daily-stories"/);
    assert.match(html, /data-daily-stories/);
    assert.match(html, /Herkenning voor onrustige momenten/);
    assert.doesNotMatch(html, /Rustig lezen, zonder account|calm-note|Je hoeft niets te plaatsen/);
    assert.doesNotMatch(html, /wisselen automatisch/);
    const dailySection = html.match(
      /<section class="daily-stories"[\s\S]*?<section class="toolbar"/,
    )[0];
    assert.equal((dailySection.match(/class="daily-story-slide/g) || []).length, 4);
    assert.equal((dailySection.match(/<article class="card"[^>]*>/g) || []).length, 4);
    assert.match(dailySection, /data-daily-prev/);
    assert.match(dailySection, /data-daily-next/);
    assert.equal((dailySection.match(/hidden aria-hidden="true"/g) || []).length, 3);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('public pages expose SEO metadata, structured data, robots, and sitemap URLs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.savePosts([
    {
      id: 'post-1',
      author: 'Originele naam',
      title: 'SEO titel',
      body: 'Een herkenbaar verhaal over hartkloppingen en stress.',
      labels: ['hartkloppingen'],
      replies: [],
    },
  ]);
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    const homeHtml = await home.text();
    const post = await fetch(`${base}/posts/post-1`);
    const postHtml = await post.text();
    const login = await fetch(`${base}/login`);
    const loginHtml = await login.text();
    const label = await fetch(`${base}/?label=hartkloppingen`);
    const labelHtml = await label.text();
    const search = await fetch(`${base}/?q=stress`);
    const searchHtml = await search.text();
    const robots = await fetch(`${base}/robots.txt`);
    const robotsText = await robots.text();
    const sitemap = await fetch(`${base}/sitemap.xml`);
    const sitemapXml = await sitemap.text();

    assert.match(homeHtml, /<meta name="robots" content="index, follow, max-image-preview:large">/);
    assert.match(homeHtml, /<script type="application\/ld\+json">/);
    assert.match(postHtml, /<meta property="og:type" content="article">/);
    assert.match(postHtml, /DiscussionForumPosting/);
    assert.match(
      postHtml,
      new RegExp(
        `<link rel="canonical" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/posts/post-1">`,
      ),
    );
    assert.match(loginHtml, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(
      loginHtml,
      new RegExp(
        `<link rel="canonical" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/login">`,
      ),
    );
    assert.match(
      labelHtml,
      /<link rel="canonical" href="http:\/\/127\.0\.0\.1:[0-9]+\/\?label=hartkloppingen">/,
    );
    assert.match(searchHtml, /<meta name="robots" content="noindex, follow">/);
    assert.match(searchHtml, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:[0-9]+\/">/);
    assert.match(robotsText, /Sitemap: http:\/\/127\.0\.0\.1:/);
    assert.match(sitemapXml, /<loc>http:\/\/127\.0\.0\.1:[0-9]+\/posts\/post-1<\/loc>/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('configured production origin permanently redirects alternate schemes and hosts', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  const previousSiteUrl = process.env.SITE_URL;
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  process.env.SITE_URL = 'https://hyperpedia.app';
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  require('../src/store').savePosts([
    { id: 'post-1', author: 'Naam', title: 'Titel', body: 'Tekst', labels: [], replies: [] },
  ]);
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const canonical = await fetch(`${base}/posts/post-1`, {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'hyperpedia.app' },
    });
    const canonicalHtml = await canonical.text();
    const alternateHost = await fetch(`${base}/posts/post-1?from=www`, {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'www.hyperpedia.app' },
      redirect: 'manual',
    });
    const insecure = await fetch(`${base}/?label=burnout`, {
      headers: { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'hyperpedia.app' },
      redirect: 'manual',
    });
    const health = await fetch(`${base}/healthz`, {
      headers: { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'fly-internal' },
      redirect: 'manual',
    });

    assert.equal(canonical.status, 200);
    assert.match(
      canonicalHtml,
      /<link rel="canonical" href="https:\/\/hyperpedia\.app\/posts\/post-1">/,
    );
    assert.match(
      canonicalHtml,
      /property="og:image:secure_url" content="https:\/\/hyperpedia\.app\/social-preview\.png\?v=[^"]+"/,
    );
    assert.equal(alternateHost.status, 308);
    assert.equal(
      alternateHost.headers.get('location'),
      'https://hyperpedia.app/posts/post-1?from=www',
    );
    assert.equal(insecure.status, 308);
    assert.equal(insecure.headers.get('location'), 'https://hyperpedia.app/?label=burnout');
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'ok\n');
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8'), /\/healthz/);
  } finally {
    if (previousSiteUrl === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSiteUrl;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('admin read metrics show only the top five titles without authors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('beheerder', 'een-veilig-wachtwoord');
  store.savePosts(
    Array.from({ length: 6 }, (_, index) => ({
      id: `post-${index + 1}`,
      author: `Auteur ${index + 1}`,
      title: `Top verhaal ${index + 1}`,
      body: 'Tekst',
      labels: [],
      replies: [],
    })),
  );
  for (let postIndex = 0; postIndex < 6; postIndex += 1) {
    for (let readIndex = 0; readIndex < 6 - postIndex; readIndex += 1)
      store.recordPostRead(`post-${postIndex + 1}`);
  }
  const { server } = require('../src/server');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'beheerder', password: 'een-veilig-wachtwoord' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const admin = await fetch(`${base}/admin`, { headers: { cookie } });
    const html = await admin.text();
    const metricsSection = html.match(
      /<section class="panel metrics-panel">[\s\S]*?<\/section>/,
    )[0];

    assert.equal(admin.status, 200);
    assert.equal((metricsSection.match(/<li>/g) || []).length, 5);
    assert.match(metricsSection, /Top verhaal 1/);
    assert.match(metricsSection, /Top verhaal 5/);
    assert.doesNotMatch(metricsSection, /Top verhaal 6/);
    assert.doesNotMatch(metricsSection, /Auteur 1/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('SEO assets, request safety, sessions and canonical routes remain consistent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('admin', 'test-password');
  store.savePosts([
    {
      id: 'one',
      title: 'Een <verhaal>',
      author: 'Naam',
      body: '<!-- <script> </script> & herkenning',
      labels: ['stress'],
      replies: [{ author: 'Naam', body: 'Antwoord' }],
    },
  ]);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base}/posts/one`, { headers: { cookie: 'broken=%ZZ' } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /twitter:title" content="Een &lt;verhaal&gt;/);
    assert.match(html, /og:image:width" content="1200"/);
    const json = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
    );
    assert.equal(json.text, '<!-- <script> </script> & herkenning');
    assert.equal(json.commentCount, 1);
    assert.equal(json.datePublished, undefined);
    assert.equal(json.image, undefined);
    const image = await fetch(html.match(/property="og:image" content="([^"]+)"/)[1]);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(Buffer.from(await image.arrayBuffer()).readUInt32BE(16), 1200);
    const manifest = await (await fetch(`${base}/site.webmanifest`)).json();
    for (const asset of [
      '/favicon.ico',
      '/favicon.svg',
      '/apple-touch-icon.png',
      ...manifest.icons.map((icon) => icon.src),
    ])
      assert.equal((await fetch(base + asset)).status, 200);
    assert.equal((await fetch(`${base}/posts/%ZZ`)).status, 400);
    assert.equal((await fetch(`${base}/posts/extra/one`)).status, 404);
    assert.equal((await fetch(`${base}/posts/one`, { method: 'HEAD' })).status, 200);
    for (const url of ['/?page=1', '/?page=garbage', '/?page=999', '/posts/one/'])
      assert.equal((await fetch(base + url, { redirect: 'manual' })).status, 308);
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'admin', password: 'test-password' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const admin = await fetch(`${base}/admin`, { headers: { cookie } });
    assert.equal(admin.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(admin.headers.get('cache-control'), 'private, no-store');
    const edit = {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({ title: '', body: '', author: '' }),
      redirect: 'manual',
    };
    assert.equal((await fetch(`${base}/admin/edit/one`, edit)).status, 400);
    assert.equal(
      (
        await fetch(`${base}/admin/edit/one`, {
          ...edit,
          headers: { cookie, origin: 'https://other.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(`${base}/admin/edit/one`, { ...edit, body: 'x'.repeat(1024 * 1024 + 1) }))
        .status,
      413,
    );
    assert.equal(store.allPosts()[0].title, 'Een <verhaal>');
    await fetch(`${base}/logout`, { method: 'POST', headers: { cookie }, redirect: 'manual' });
    assert.equal(
      (await fetch(`${base}/admin`, { headers: { cookie }, redirect: 'manual' })).status,
      302,
    );
    assert.equal((await fetch(base)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('story sidebar suggests other matching topics and the shared editor preserves content', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('admin', 'test-password');
  store.savePosts([
    {
      id: 'current',
      title: 'Mijn verhaal',
      author: 'Naam',
      body: 'Bestaande tekst',
      labels: ['ademhaling'],
    },
    {
      id: 'related',
      title: '<Herkenning>',
      author: 'Een naam',
      body: 'Andere tekst',
      labels: ['ademhaling'],
    },
    {
      id: 'unrelated',
      title: 'Ander onderwerp',
      author: 'Naam',
      body: 'Tekst',
      labels: ['slapen'],
    },
  ]);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(`${base}/posts/current`)).text();
    const sidebar = html.match(/<aside class="story-sidebar"[\s\S]*?<\/aside>/)[0];
    assert.match(sidebar, /href="\/posts\/related"/);
    assert.match(sidebar, /&lt;Herkenning&gt;/);
    assert.doesNotMatch(sidebar, /posts\/current|posts\/unrelated/);
    assert.match(html, /data-reading-size/);
    const login = await fetch(`${base}/login`, {
      method: 'POST',
      body: new URLSearchParams({ username: 'admin', password: 'test-password' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const editor = await (
      await fetch(`${base}/admin/edit/current`, { headers: { cookie } })
    ).text();
    assert.match(editor, /action="\/admin\/edit\/current"/);
    assert.match(editor, /name="title" value="Mijn verhaal"/);
    assert.match(editor, /name="body"[^>]*>Bestaande tekst<\/textarea>/);
    const dashboard = await (await fetch(`${base}/admin`, { headers: { cookie } })).text();
    assert.match(dashboard, /class="admin-workspace"/);
    assert.match(dashboard, /action="\/admin\/posts"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v0.5.0 keeps admin hidden, exports content, guards stale edits and preserves result navigation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('admin', 'safe-password');
  store.savePosts([
    {
      id: 'one',
      title: 'Déjà vu',
      author: 'Naam',
      body: 'Spanning met vreemde ademhaling',
      labels: ['ademhaling'],
    },
  ]);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.headers.get('x-hyperpedia-version'), null);
    const html = await home.text();
    const header = html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
    assert.doesNotMatch(header, /href="\/login"|Beheer/);
    assert.match(header, /<svg class="icon icon-moon"/);
    assert.ok(html.includes(`style.css?v=${APP_VERSION}`));
    assert.ok(html.includes(`class="site-version">v${APP_VERSION}`));
    assert.doesNotMatch(html, /[☾☀←→↗]/);
    const results = await (await fetch(base + '/?q=deja+ademhaling')).text();
    assert.match(results, /Déjà vu/);
    assert.match(results, /posts\/one\?from=/);
    const story = await (
      await fetch(base + '/posts/one?from=' + encodeURIComponent('/?q=deja ademhaling'))
    ).text();
    assert.match(story, /class="back-link" href="\/\?q=deja\+ademhaling"/);
    assert.match(story, /data-story-copy/);
    assert.equal((await fetch(base + '/admin/export', { redirect: 'manual' })).status, 302);
    assert.equal((await fetch(base + '/style.css', { method: 'POST' })).status, 405);
    const login = await fetch(base + '/login', {
      method: 'POST',
      body: new URLSearchParams({ username: 'admin', password: 'safe-password' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const exported = await fetch(base + '/admin/export', { headers: { cookie } });
    assert.ok(exported.headers.get('content-disposition').includes(`v${APP_VERSION}.json`));
    assert.equal(exported.headers.get('cache-control'), 'private, no-store');
    const archive = await exported.json();
    assert.equal(archive.posts[0].title, 'Déjà vu');
    assert.equal(archive.appVersion, APP_VERSION);
    assert.equal(archive.schemaVersion, 1);
    assert.doesNotMatch(JSON.stringify(archive), /salt|password|iterations/);
    const edit = await (await fetch(base + '/admin/edit/one', { headers: { cookie } })).text();
    const revision = edit.match(/name="revision" value="([^"]+)"/)[1];
    const records = store.postsForEdit();
    records[0].body = 'A newer edit from a second tab';
    store.savePosts(records);
    const response = await fetch(base + '/admin/edit/one', {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({
        title: 'Changed',
        author: 'Naam',
        body: 'My stale draft',
        revision,
      }),
      redirect: 'manual',
    });
    assert.equal(response.status, 409);
    assert.match(await response.text(), /My stale draft/);
    assert.equal(store.allPosts()[0].body, 'A newer edit from a second tab');
    assert.equal(
      (await fetch(base + '/admin/edit/extra/one', { method: 'POST', headers: { cookie } })).status,
      404,
    );
    await fetch(base + '/posts/one/read', { method: 'POST', headers: { cookie } });
    assert.equal(store.getStats().readCount, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('adaptive page sizes fill complete rows while sitemap and default URLs stay stable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  require('../src/store').savePosts(
    Array.from({ length: 63 }, (_, i) => ({
      id: String(i),
      title: `Post ${String(i).padStart(2, '0')}`,
      author: 'Naam',
      body: 'Tekst',
      labels: ['stress'],
    })),
  );
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const perPage of [6, 12, 24, 30, 36]) {
      const html = await (await fetch(`${base}/?label=stress&perPage=${perPage}`)).text();
      const stories = html.match(/<section class="stories-index"[\s\S]*?<\/section>/)[0];
      assert.equal((stories.match(/data-story-id=/g) || []).length, perPage);
      assert.match(html, /robots" content="noindex, follow"/);
      assert.match(html, new RegExp(`page=2[^"]*perPage=${perPage}`));
    }
    const last = await (await fetch(base + '/?perPage=24&page=3')).text();
    assert.equal(
      (
        last
          .match(/<section class="stories-index"[\s\S]*?<\/section>/)[0]
          .match(/data-story-id=/g) || []
      ).length,
      15,
    );
    assert.equal((await fetch(base + '/?perPage=100000', { redirect: 'manual' })).status, 308);
    const sitemap = await (await fetch(base + '/sitemap.xml')).text();
    assert.doesNotMatch(sitemap, /perPage/);
    assert.match(sitemap, /\?page=4/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test(
  'unfinished proxied login uploads do not consume password-verification slots',
  { timeout: 10000 },
  async () => {
    const http = require('node:http');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
    process.env.DATA_DIR = dir;
    process.env.SESSION_SECRET = 'x'.repeat(32);
    const previousProxyTrust = process.env.TRUST_APACHE_PROXY;
    process.env.TRUST_APACHE_PROXY = 'true';
    delete require.cache[require.resolve('../src/store')];
    delete require.cache[require.resolve('../src/server')];
    const store = require('../src/store');
    store.saveAdmin('admin', 'safe-password');
    const { server } = require('../src/server');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const uploads = [];
    try {
      for (let i = 1; i <= 4; i++) {
        const received = new Promise((resolve) => server.once('request', resolve));
        const request = http.request(
          base + '/login',
          {
            method: 'POST',
            headers: {
              'x-hyperpedia-client-ip': `192.0.2.${i}`,
              'content-length': '100',
              'content-type': 'application/x-www-form-urlencoded',
            },
          },
          (response) => response.resume(),
        );
        request.on('error', () => {});
        uploads.push(request);
        request.flushHeaders();
        await received;
      }
      const login = await fetch(base + '/login', {
        method: 'POST',
        headers: { 'x-hyperpedia-client-ip': '192.0.2.100' },
        body: new URLSearchParams({ username: 'admin', password: 'safe-password' }),
        redirect: 'manual',
      });
      assert.equal(login.status, 302);
      assert.equal(login.headers.get('location'), '/admin');
      assert.match(login.headers.get('set-cookie'), /hyperpedia_session=/);
    } finally {
      uploads.forEach((request) => request.destroy());
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      if (previousProxyTrust === undefined) delete process.env.TRUST_APACHE_PROXY;
      else process.env.TRUST_APACHE_PROXY = previousProxyTrust;
    }
  },
);

test('stale reply edits preserve every submitted field and reopen the reply editor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('admin', 'safe-password');
  store.savePosts([
    {
      id: 'story',
      title: 'Verhaal',
      author: 'Auteur',
      body: 'Tekst',
      replies: [
        { id: 'reply', originalReplier: 'Origineel', author: 'Beheerder', body: 'Antwoord' },
      ],
    },
  ]);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(base + '/login', {
      method: 'POST',
      body: new URLSearchParams({ username: 'admin', password: 'safe-password' }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const editor = await (
      await fetch(base + '/admin/reply/story/reply/edit', { headers: { cookie } })
    ).text();
    const revision = editor.match(/name="revision" value="([^"]+)"/)[1];
    const posts = store.postsForEdit();
    posts[0].body = 'Nieuwe wijziging';
    store.savePosts(posts);
    const response = await fetch(base + '/admin/reply/story/reply/edit', {
      method: 'POST',
      headers: { cookie },
      redirect: 'manual',
      body: new URLSearchParams({
        revision,
        originalReplier: 'Lezer <origineel>',
        author: 'Nieuwe beheerder',
        body: 'Mijn concept </textarea><script>bad()</script>',
      }),
    });
    assert.equal(response.status, 409);
    const recovery = await response.text();
    assert.match(recovery, /Naam originele replier: Lezer &lt;origineel&gt;/);
    assert.match(recovery, /Naam beheerder: Nieuwe beheerder/);
    assert.match(recovery, /Mijn concept &lt;\/textarea&gt;&lt;script&gt;bad\(\)&lt;\/script&gt;/);
    assert.match(recovery, /href="\/admin\/reply\/story\/reply\/edit"/);
    assert.doesNotMatch(recovery, /href="\/admin\/edit\/story"/);
    assert.equal(store.allPosts()[0].replies[0].body, 'Antwoord');
    const latest = await (
      await fetch(base + '/admin/reply/story/reply/edit', { headers: { cookie } })
    ).text();
    const latestRevision = latest.match(/name="revision" value="([^"]+)"/)[1];
    const retry = await fetch(base + '/admin/reply/story/reply/edit', {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({
        revision: latestRevision,
        originalReplier: 'Lezer',
        author: 'Nieuwe beheerder',
        body: 'Mijn concept',
      }),
      redirect: 'manual',
    });
    assert.equal(retry.status, 302);
    assert.equal(store.allPosts()[0].replies[0].body, 'Mijn concept');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test(
  'login uploads reject oversized and excess requests, close sockets, and expire occupied slots',
  { timeout: 12000 },
  async () => {
    const http = require('node:http');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyperpedia-'));
    process.env.DATA_DIR = dir;
    process.env.SESSION_SECRET = 'x'.repeat(32);
    const previousProxyTrust = process.env.TRUST_APACHE_PROXY;
    process.env.TRUST_APACHE_PROXY = 'true';
    delete require.cache[require.resolve('../src/store')];
    delete require.cache[require.resolve('../src/server')];
    const store = require('../src/store');
    store.saveAdmin('admin', 'safe-password');
    const { server } = require('../src/server');
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const requests = [];
    function upload(ip, { length, data = '', complete = false } = {}) {
      const received = new Promise((resolve) => server.once('request', resolve));
      let request;
      let close;
      const closed = new Promise((resolve) => {
        close = resolve;
      });
      const response = new Promise((resolve, reject) => {
        request = http.request(
          base + '/login',
          {
            method: 'POST',
            headers: {
              'x-hyperpedia-client-ip': ip,
              ...(length === undefined ? {} : { 'content-length': String(length) }),
            },
          },
          (res) => {
            res.resume();
            res.once('end', () => resolve({ status: res.statusCode, headers: res.headers }));
          },
        );
        request.on('error', reject);
        request.once('socket', (socket) => socket.once('close', close));
      });
      response.catch(() => {});
      requests.push(request);
      request.flushHeaders();
      if (data) request.write(data);
      if (complete) request.end();
      return { received, response, closed };
    }
    try {
      const declared = upload('192.0.2.200', { length: 8193 });
      assert.equal((await declared.response).status, 413);
      await declared.closed;
      const chunked = upload('192.0.2.200', { data: 'x'.repeat(8193), complete: true });
      assert.equal((await chunked.response).status, 413);
      await chunked.closed;
      const slow = [];
      for (let i = 1; i <= 16; i++) {
        const active = upload(`192.0.2.${i}`, { length: 8192, data: 'x='.padEnd(8190, 'x') });
        slow.push(active);
        await active.received;
      }
      for (const ip of ['192.0.2.1', '192.0.2.100']) {
        const rejected = upload(ip, { length: 100 });
        const response = await rejected.response;
        assert.equal(response.status, 429);
        assert.equal(response.headers.connection, 'close');
        assert.equal(response.headers['retry-after'], '1');
        await rejected.closed;
      }
      const timeouts = await Promise.all(slow.map((active) => active.response));
      assert.ok(
        timeouts.every(
          (response) => response.status === 408 && response.headers.connection === 'close',
        ),
      );
      await Promise.all(slow.map((active) => active.closed));
      const login = await fetch(base + '/login', {
        method: 'POST',
        headers: { 'x-hyperpedia-client-ip': '192.0.2.100' },
        body: new URLSearchParams({ username: 'admin', password: 'safe-password' }),
        redirect: 'manual',
      });
      assert.equal(login.status, 302);
      assert.match(login.headers.get('set-cookie'), /hyperpedia_session=/);
    } finally {
      requests.forEach((request) => request.destroy());
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      if (previousProxyTrust === undefined) delete process.env.TRUST_APACHE_PROXY;
      else process.env.TRUST_APACHE_PROXY = previousProxyTrust;
    }
  },
);
