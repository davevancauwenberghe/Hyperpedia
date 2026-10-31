const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { replyAnchor, replyKey } = require('../src/reading');

async function fixture(t, posts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-review-http-'));
  process.env.DATA_DIR = dir;
  process.env.SESSION_SECRET = 'review-test-secret-'.repeat(4);
  delete process.env.SITE_URL;
  delete require.cache[require.resolve('../src/store')];
  delete require.cache[require.resolve('../src/server')];
  const store = require('../src/store');
  store.saveAdmin('admin', 'review-test-password');
  store.savePosts(posts);
  const { server } = require('../src/server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const login = await fetch(base + '/login', {
    method: 'POST',
    body: new URLSearchParams({ username: 'admin', password: 'review-test-password' }),
    redirect: 'manual',
  });
  assert.equal(login.status, 302);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const revision = async (route) =>
    (await (await fetch(base + route, { headers: { cookie } })).text()).match(
      /name="revision" value="([^"]+)"/,
    )[1];
  return { store, base, cookie, revision, dir };
}
test('reply edit and delete encode archived IDs, trim names, and remove only the intended reply', async (t) => {
  const ids = ['a%20b', 'story €1'];
  const { store, base, cookie, revision } = await fixture(
    t,
    ids.map((id) => ({
      id,
      title: 'Archief',
      body: 'Tekst',
      replies: [
        { id: 'first', body: 'Eerste' },
        { id: 'second', body: 'Tweede' },
      ],
    })),
  );
  for (const id of ids) {
    const editor = `/admin/reply/${encodeURIComponent(id)}/first/edit`;
    const edit = await fetch(base + editor, {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({
        revision: await revision(editor),
        originalReplier: '  Origineel  ',
        author: '  Beheerder  ',
        body: 'Bijgewerkt',
      }),
      redirect: 'manual',
    });
    assert.equal(edit.status, 302);
    assert.equal(edit.headers.get('location'), '/posts/' + encodeURIComponent(id));
    assert.equal((await fetch(base + edit.headers.get('location'))).status, 200);
    assert.equal(store.getPost(id).replies[0].author, 'Beheerder');
    assert.equal(store.getPost(id).replies[0].originalReplier, 'Origineel');
    const remove = await fetch(base + editor.replace('/edit', '/delete'), {
      method: 'POST',
      headers: { cookie },
      body: new URLSearchParams({ revision: await revision(editor) }),
      redirect: 'manual',
    });
    assert.equal(remove.status, 302);
    assert.equal(remove.headers.get('location'), '/posts/' + encodeURIComponent(id));
    assert.deepEqual(
      store.getPost(id).replies.map((reply) => reply.id),
      ['second'],
    );
  }
});
test('missing and stale revisions fail closed for stories, reply edits and reply deletion', async (t) => {
  const { store, base, cookie, revision } = await fixture(t, [
    {
      id: 'one',
      title: 'Origineel',
      author: 'Auteur',
      body: 'Tekst',
      replies: [{ id: 'reply', body: 'Antwoord' }],
    },
  ]);
  const headers = { cookie };
  const missingStory = await fetch(base + '/admin/edit/one', {
    method: 'POST',
    headers,
    body: new URLSearchParams({ title: 'Concept', author: 'Auteur', body: 'Mijn concept' }),
  });
  assert.equal(missingStory.status, 409);
  assert.match(await missingStory.text(), /Mijn concept/);
  const missingReply = await fetch(base + '/admin/reply/one/reply/edit', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      originalReplier: 'Oorsprong',
      author: 'Beheerder',
      body: 'Reactieconcept',
    }),
  });
  assert.equal(missingReply.status, 409);
  assert.match(await missingReply.text(), /Oorsprong/);
  const old = await revision('/admin/reply/one/reply/edit');
  const edited = store.postsForEdit();
  edited[0].body = 'Andere tab';
  store.savePosts(edited);
  for (const body of [new URLSearchParams(), new URLSearchParams({ revision: old })]) {
    const remove = await fetch(base + '/admin/reply/one/reply/delete', {
      method: 'POST',
      headers,
      body,
    });
    assert.equal(remove.status, 409);
  }
  assert.equal(store.getPost('one').title, 'Origineel');
  assert.equal(store.getPost('one').replies[0].body, 'Antwoord');
});
test('legacy id-less reply anchors remain stable and have no broken administration controls', async (t) => {
  const reply = { author: 'Lezer', body: 'Oude reactie' };
  const { base, cookie } = await fixture(t, [
    {
      id: 'legacy',
      title: 'Oud verhaal',
      replies: [reply, { id: 'valid', body: 'Nieuwere reactie' }],
    },
  ]);
  const html = await (await fetch(base + '/posts/legacy', { headers: { cookie } })).text();
  assert.ok(html.includes(`id="${replyAnchor(replyKey(reply, 0))}"`));
  assert.doesNotMatch(html, /\/undefined\//);
  assert.equal((html.match(/Reactie bewerken<\/a>/g) || []).length, 1);
});
test('clearing a read counter requires a separate confirmation and preserves the story', async (t) => {
  const { store, base, cookie } = await fixture(t, [{ id: 'one', title: 'Een verhaal' }]);
  store.recordPostRead('one');
  const route = '/admin/read-metrics/one/purge';
  const page = await fetch(base + route, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Leesteller wissen\?/);
  assert.equal(store.getStats().readCount, 1);
  assert.equal((await fetch(base + route, { method: 'POST', headers: { cookie } })).status, 400);
  assert.equal(store.getStats().readCount, 1);
  const confirmed = await fetch(base + route, {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams({ confirmation: 'yes' }),
    redirect: 'manual',
  });
  assert.equal(confirmed.status, 302);
  assert.equal(store.getStats().readCount, 0);
  assert.equal(store.getPost('one').title, 'Een verhaal');
});
test('public counters require an explicit first-party consent signal, deduplicate repeats and rate limit bursts', async (t) => {
  const { store, base, dir } = await fixture(
    t,
    Array.from({ length: 32 }, (_, index) => ({ id: 'story-' + index })),
  );
  const url = base + '/posts/story-0/read';
  assert.equal((await fetch(url, { method: 'POST' })).status, 403);
  assert.equal(
    (await fetch(url, { method: 'POST', headers: { 'x-hyperpedia-consent': 'statistics' } }))
      .status,
    403,
  );
  const headers = { origin: base, 'x-hyperpedia-consent': 'statistics' };
  const first = await fetch(url, { method: 'POST', headers });
  assert.deepEqual(await first.json(), { ok: true, counted: true });
  for (let index = 0; index < 300; index++) {
    const repeated = await fetch(url, { method: 'POST', headers });
    assert.equal((await repeated.json()).counted, false);
  }
  assert.equal(store.getStats().readCount, 1);
  assert.equal(fs.existsSync(path.join(dir, 'hyperpedia-read-metrics.json')), false);
  for (let index = 1; index < 30; index++)
    assert.equal(
      (await fetch(`${base}/posts/story-${index}/read`, { method: 'POST', headers })).status,
      200,
    );
  const limited = await fetch(base + '/posts/story-30/read', { method: 'POST', headers });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  assert.equal(store.getStats().readCount, 30);
});
