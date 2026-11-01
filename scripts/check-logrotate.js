// CI-only retention check. Rotates disposable logs; never opens production logs
// or reloads the host's Apache service.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-logrotate-'));
try {
  const log = path.join(dir, 'access.log');
  const config = path.join(dir, 'rotation.conf');
  const state = path.join(dir, 'rotation.state');
  const marker = path.join(dir, 'reloaded');
  const group = execFileSync('id', ['-gn'], { encoding: 'utf8' }).trim();
  const production = fs.readFileSync(
    path.join(__dirname, '../deploy/logrotate-hyperpedia.conf'),
    'utf8',
  );
  fs.writeFileSync(
    config,
    production
      .replace('/var/log/apache2/hyperpedia/*.log', log)
      .replace('create 0640 root adm', `create 0640 ${os.userInfo().username} ${group}`)
      .replace(
        /postrotate[\s\S]*?endscript/,
        `postrotate\n        echo reloaded >> '${marker}'\n    endscript`,
      ),
    { mode: 0o600 },
  );
  for (let day = 0; day < 15; day++) {
    fs.appendFileSync(log, `Day ${day}\n`, { mode: 0o640 });
    execFileSync('/usr/sbin/logrotate', ['--force', '--state', state, config]);
    assert.equal(fs.statSync(log).mode & 0o777, 0o640);
  }
  const archives = fs.readdirSync(dir).filter((name) => /^access\.log\.\d+(?:\.gz)?$/.test(name));
  assert.equal(archives.length, 13);
  assert.equal(fs.readFileSync(log + '.1', 'utf8'), 'Day 14\n');
  assert.equal(zlib.gunzipSync(fs.readFileSync(log + '.13.gz')).toString(), 'Day 2\n');
  assert.equal(fs.readFileSync(marker, 'utf8').trim().split('\n').length, 15);
  // Empty error logs also rotate so old IP-bearing copies expire when traffic stops.
  execFileSync('/usr/sbin/logrotate', ['--force', '--state', state, config]);
  assert.equal(fs.readFileSync(log + '.1', 'utf8'), '');
  assert.equal(zlib.gunzipSync(fs.readFileSync(log + '.13.gz')).toString(), 'Day 3\n');
  console.log('Private log rotation, bounded retention and idle-log expiry: passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
