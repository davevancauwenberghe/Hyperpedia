// Disposable synthetic archive; never opens the production DATA_DIR.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const count = Number(process.argv[2] || 1000);
if (!Number.isInteger(count) || count < 1 || count > 20000)
  throw new Error('Choose 1–20000 synthetic stories.');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-benchmark-'));
const file = path.join(dir, 'hyperpedia-posts.json');
const body = 'Een ervaring met ademhaling, duizeligheid en spanning. '.repeat(150);
const descriptor = fs.openSync(file, 'wx', 0o600);
fs.writeSync(descriptor, '{"posts":[');
for (let index = 0; index < count; index++) {
  if (index) fs.writeSync(descriptor, ',');
  fs.writeSync(
    descriptor,
    JSON.stringify({
      id: 'story-' + index,
      title: 'Verhaal ' + String(index).padStart(5, '0'),
      author: 'Lezer',
      body,
      labels: ['stress', 'ademhaling'],
      replies: [{ id: 'reply', body: 'Een antwoord over spanning en tintelingen. '.repeat(12) }],
    }),
  );
}
fs.writeSync(descriptor, ']}');
fs.closeSync(descriptor);
process.env.DATA_DIR = dir;
process.env.SITE_URL = '';
process.env.REQUIRE_EXISTING_DATA = 'false';
process.env.SESSION_SECRET = 'synthetic-benchmark-secret-'.repeat(3);
const source = process.env.HYPERPEDIA_BENCHMARK_SOURCE || path.join(__dirname, '..');
const { server } = require(path.join(source, 'src/server'));
(async () => {
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (route) => {
      const started = performance.now();
      const response = await fetch(base + route);
      if (!response.ok) throw new Error('Synthetic request failed: ' + response.status);
      await response.text();
      return Math.round(performance.now() - started);
    };
    const homepageMs = await request('/');
    const firstSearchMs = await request('/?q=ademhaling+spanning');
    const started = performance.now();
    await Promise.all(Array.from({ length: 8 }, () => request('/?q=ademhaling+spanning')));
    console.log(
      JSON.stringify(
        {
          stories: count,
          archiveMiB: +(fs.statSync(file).size / 1024 ** 2).toFixed(1),
          homepageMs,
          firstSearchMs,
          eightSearchesMs: Math.round(performance.now() - started),
          rssMiB: +(process.memoryUsage().rss / 1024 ** 2).toFixed(1),
          peakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
        },
        null,
        2,
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
