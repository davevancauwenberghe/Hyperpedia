const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('personal library, paths, author URLs and protected path editing preserve the archive', async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-reading-'));
  process.env.SESSION_SECRET = 'x'.repeat(32);
  delete process.env.SITE_URL;
  const store = require('../src/store');
  store.saveAdmin('admin', 'safe-password');
  store.savePosts(
    Array.from({ length: 6 }, (_, i) => ({
      id: `post-${i}`,
      title: `Verhaal ${i}`,
      author: 'Ellen',
      body: 'Een eerste alinea.\n\nEen tweede alinea.',
      labels: ['ademhaling'],
      replies: [{ author: 'Hannah', body: 'Een reactie' }],
    })),
  );
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const story = await (await fetch(base + '/posts/post-0')).text();
    const schema = JSON.parse(story.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.image, undefined);
    assert.match(story, /property="og:image"/);
    const options = story.match(/<details class="reading-preferences"[\s\S]*?<\/details>/)[0];
    for (const control of [
      'data-reading-size',
      'data-reading-width',
      'data-bookmark',
      'data-focus-toggle',
      'data-story-share',
      'data-story-copy',
      'data-story-print',
    ])
      assert.ok(options.includes(control), control);
    assert.doesNotMatch(story, /data-progress|data-story-resume|reader-toolbar|data-reading-block/);
    const privacy = await (await fetch(base + '/privacy')).text();
    assert.match(privacy, /data-privacy-form/);
    assert.match(privacy, /één jaar/);
    assert.match(privacy, /hyperpedia-consent-v1/);
    assert.match(privacy, /hyperpedia_session/);
    for (const author of [schema.author, schema.comment[0].author]) {
      assert.ok(author.url.startsWith(base + '/bronvermelding/'));
      const attribution = await fetch(author.url);
      assert.equal(attribution.status, 200);
      const html = await attribution.text();
      assert.ok(html.includes(author.name));
      assert.match(html, /geen gebruikersaccount of geverifieerde biografie/);
      const entity = JSON.parse(
        html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
      ).mainEntity;
      assert.equal(entity['@id'], author['@id']);
    }
    assert.equal((await fetch(base + '/bronvermelding/post-0/reacties/missing')).status, 404);
    const home = await (await fetch(base)).text();
    assert.doesNotMatch(home, /data-bookmark=|data-personal-shelf/);
    const homeSchema = JSON.parse(
      home.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1],
    );
    assert.equal(homeSchema.mainEntity['@type'], 'ItemList');
    assert.equal(homeSchema.mainEntity.itemListElement.length, 6);
    assert.ok(
      homeSchema.mainEntity.itemListElement.every((item) => item.url.startsWith(base + '/posts/')),
    );
    const routeUrl = home.match(/class="path-card" href="([^"]+)"/)[1];
    const routeId = routeUrl.split('/').pop();
    const routeHtml = await (await fetch(base + routeUrl)).text();
    assert.doesNotMatch(routeHtml, /data-bookmark=/);
    assert.equal((routeHtml.match(/class="path-number"/g) || []).length, 5);
    const inRoute = await (await fetch(`${base}/posts/post-0?route=${routeId}`)).text();
    assert.match(inRoute, /Leesroute · 1 van 5/);
    assert.match(inRoute, /Volgend verhaal/);
    assert.match(inRoute, /canonical" href="[^"?]+\/posts\/post-0"/);
    const library = await (await fetch(base + '/leeslijst')).text();
    assert.match(library, /robots" content="noindex, follow"/);
    assert.doesNotMatch(library, /data-reader-id=|data-continue-list/);
    assert.match(library, /deze browser en dit browserprofiel/);
    const catalog = await (await fetch(base + '/leeslijst/catalogus.json')).json();
    assert.deepEqual(Object.keys(catalog.posts[0]).sort(), ['author', 'id', 'title']);
    const sitemap = await (await fetch(base + '/sitemap.xml')).text();
    assert.ok(sitemap.includes(routeUrl));
    assert.doesNotMatch(sitemap, /leeslijst|bronvermelding/);
    assert.equal((await fetch(base + '/admin/leesroutes', { redirect: 'manual' })).status, 302);
    const login = await fetch(base + '/login', {
      method: 'POST',
      body: new URLSearchParams({
        username: 'admin',
        password: 'safe-password',
      }),
      redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(base + '/privacy')).headers.get('cache-control'), 'no-cache');
    for (const method of ['GET', 'HEAD']) {
      const privacy = await fetch(base + '/privacy', {
        method,
        headers: { cookie },
      });
      assert.equal(privacy.headers.get('cache-control'), 'private, no-store');
    }
    const editor = await (
      await fetch(`${base}/admin/leesroutes?id=${routeId}`, {
        headers: { cookie },
      })
    ).text();
    const revision = editor.match(/name="revision" value="([^"]+)"/)[1];
    const body = new URLSearchParams({
      revision,
      id: routeId,
      title: 'Een eigen route',
      description: 'Een handmatige selectie',
      post1: 'post-5',
      post2: 'post-3',
      post3: 'post-1',
    });
    const response = await fetch(base + '/admin/leesroutes', {
      method: 'POST',
      headers: { cookie },
      body,
      redirect: 'manual',
    });
    assert.equal(response.status, 302);
    assert.deepEqual(store.getPathDefinitions()[0].postIds, ['post-5', 'post-3', 'post-1']);
    assert.equal(
      (
        await fetch(base + '/admin/leesroutes', {
          method: 'POST',
          headers: { cookie },
          body,
          redirect: 'manual',
        })
      ).status,
      409,
    );
    const selected = await (await fetch(base + routeUrl)).text();
    assert.ok(selected.indexOf('Verhaal 5') < selected.indexOf('Verhaal 3'));
    assert.equal(store.allPosts()[0].body, 'Een eerste alinea.\n\nEen tweede alinea.');
    const exported = await (await fetch(base + '/admin/export', { headers: { cookie } })).json();
    assert.equal(exported.readingPaths[0].id, routeId);
    const latest = await (
      await fetch(`${base}/admin/leesroutes?id=${routeId}`, {
        headers: { cookie },
      })
    ).text();
    const reset = await fetch(base + '/admin/leesroutes/reset', {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({
        id: routeId,
        revision: latest.match(/name="revision" value="([^"]+)"/)[1],
      }),
      redirect: 'manual',
    });
    assert.equal(reset.status, 302);
    assert.deepEqual(store.getPathDefinitions(), []);
    store.savePathDefinitions([
      {
        id: routeId,
        title: 'Route',
        description: '',
        postIds: ['post-0', 'post-1', 'post-2'],
      },
    ]);
    fs.writeFileSync(path.join(process.env.DATA_DIR, 'hyperpedia-reading-paths.json'), '{broken');
    assert.throws(() => store.savePathDefinitions([]));
    assert.equal(
      fs.readFileSync(path.join(process.env.DATA_DIR, 'hyperpedia-reading-paths.json'), 'utf8'),
      '{broken',
    );
    assert.equal((await fetch(base + '/posts/post-0')).status, 200);
    assert.match(await (await fetch(base + '/leesroutes')).text(), /ademhaling/);
    const recoveryExport = await fetch(base + '/admin/export', {
      headers: { cookie },
    });
    assert.equal(recoveryExport.status, 200);
    assert.equal(recoveryExport.headers.get('cache-control'), 'private, no-store');
    const recovery = await recoveryExport.json();
    assert.equal(recovery.posts.length, 6);
    assert.equal(recovery.posts[0].body, 'Een eerste alinea.\n\nEen tweede alinea.');
    assert.equal(recovery.readingPaths, null);
    assert.equal(recovery.warnings[0].code, 'READING_PATHS_UNREADABLE');
    assert.equal(
      fs.readFileSync(path.join(process.env.DATA_DIR, 'hyperpedia-reading-paths.json'), 'utf8'),
      '{broken',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
