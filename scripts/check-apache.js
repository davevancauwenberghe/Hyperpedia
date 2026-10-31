// CI-only TLS/proxy integration. Uses a disposable Apache container and mock backend.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hyper-apache-'));
const name = 'hyperpedia-apache-check-' + process.pid;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const backend = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(req.headers));
});
function request(ip) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: '127.0.0.1',
        port: 18443,
        servername: 'hyperpedia.app',
        ca: fs.readFileSync(path.join(dir, 'hyperpedia.app.pem')),
        agent: false,
        headers: {
          Host: 'hyperpedia.app',
          'CF-Connecting-IP': ip,
          'X-Hyperpedia-Client-IP': '203.0.113.200',
          'X-Forwarded-Host': 'forged.invalid',
          'X-Forwarded-Proto': 'http',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ headers: res.headers, forwarded: JSON.parse(body) });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.setTimeout(1000, () => req.destroy(new Error('Apache request timed out')));
    req.on('error', reject);
    req.end();
  });
}
async function eventually(check) {
  let error;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      return await check();
    } catch (failure) {
      error = failure;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw error;
}
(async () => {
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=hyperpedia.app',
        '-addext',
        'subjectAltName=DNS:hyperpedia.app',
        '-keyout',
        path.join(dir, 'hyperpedia.app.key'),
        '-out',
        path.join(dir, 'hyperpedia.app.pem'),
      ],
      { stdio: 'ignore' },
    );
    fs.chmodSync(path.join(dir, 'hyperpedia.app.key'), 0o600);
    const image = 'httpd:2.4';
    let base = docker('run', '--rm', image, 'cat', '/usr/local/apache2/conf/httpd.conf');
    for (const module of ['headers', 'remoteip', 'proxy', 'proxy_http', 'ssl', 'socache_shmcb']) {
      base = base.replace(new RegExp(`^#(LoadModule ${module}_module .+)$`, 'm'), '$1');
    }
    base = base.replace(/^Listen 80$/m, 'Listen 127.0.0.1:18443');
    base += '\nServerName hyperpedia.app\nInclude /hyperpedia-test/vhost.conf\n';
    fs.writeFileSync(path.join(dir, 'httpd.conf'), base);
    const vhost = fs
      .readFileSync(path.join(__dirname, '../deploy/apache-hyperpedia.conf'), 'utf8')
      .replace(/\*:80>/g, '*:18083>')
      .replace(/\*:443>/g, '*:18443>')
      .replaceAll('/etc/ssl/cloudflare/', '/hyperpedia-test/')
      .replaceAll('127.0.0.1:18081', '127.0.0.1:18082');
    fs.writeFileSync(path.join(dir, 'vhost.conf'), vhost);
    const mounts = [
      '--mount',
      `type=bind,src=${dir},dst=/hyperpedia-test,readonly`,
      '-e',
      'APACHE_LOG_DIR=/usr/local/apache2/logs',
    ];
    docker('run', '--rm', ...mounts, image, 'httpd', '-f', '/hyperpedia-test/httpd.conf', '-t');
    await new Promise((resolve) => backend.listen(18082, '127.0.0.1', resolve));
    // Host networking is only for the local CI mock backend; no egress is tested.
    docker(
      'run',
      '-d',
      '--name',
      name,
      '--network',
      'host',
      ...mounts,
      image,
      'httpd-foreground',
      '-f',
      '/hyperpedia-test/httpd.conf',
    );
    const direct = await eventually(() => request('192.0.2.10'));
    assert.equal(
      direct.forwarded['x-hyperpedia-client-ip'],
      '127.0.0.1',
      'Untrusted direct clients cannot spoof CF-Connecting-IP',
    );
    assert.equal(direct.forwarded['x-forwarded-host'], undefined);
    assert.equal(direct.forwarded['x-forwarded-proto'], 'https');
    assert.equal(direct.headers['strict-transport-security'], 'max-age=31536000');
    // Simulate the edge on loopback in this disposable copy only, never the shipped vhost.
    fs.writeFileSync(
      path.join(dir, 'vhost.conf'),
      vhost.replace(
        '    RemoteIPHeader CF-Connecting-IP',
        '    RemoteIPHeader CF-Connecting-IP\n    RemoteIPTrustedProxy 127.0.0.1',
      ),
    );
    docker('exec', name, 'httpd', '-f', '/hyperpedia-test/httpd.conf', '-k', 'graceful');
    for (const ip of ['192.0.2.10', '192.0.2.11']) {
      await eventually(async () => {
        const proxied = await request(ip);
        assert.equal(
          proxied.forwarded['x-hyperpedia-client-ip'],
          ip,
          'Trusted edges must forward separate visitor addresses',
        );
      });
    }
    console.log('Apache TLS, HSTS, trusted visitor IPs and spoofed-header rejection: passed');
  } catch (error) {
    try {
      console.error(docker('logs', '--tail', '30', name));
    } catch {}
    throw error;
  } finally {
    try {
      docker('rm', '-f', name);
    } catch {}
    await new Promise((resolve) => backend.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
