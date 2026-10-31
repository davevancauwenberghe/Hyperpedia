const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const assets = {
  'pwa.js': 'application/javascript',
  'sw.js': 'application/javascript',
  'offline.html': 'text/html',
  'offline.js': 'application/javascript',
  'storage.js': 'application/javascript',
  'privacy.js': 'application/javascript',
  'reading.js': 'application/javascript',
  'archive.js': 'application/javascript',
  'style.css': 'text/css',
  'app.js': 'application/javascript',
  'theme.js': 'application/javascript',
  'favicon.svg': 'image/svg+xml',
  'favicon.ico': 'image/x-icon',
  'favicon-48.png': 'image/png',
  'apple-touch-icon.png': 'image/png',
  'icon-192.png': 'image/png',
  'icon-512.png': 'image/png',
  'icon-maskable-192.png': 'image/png',
  'icon-maskable-512.png': 'image/png',
  'social-preview.png': 'image/png',
  'social-preview.svg': 'image/svg+xml',
  'site.webmanifest': 'application/manifest+json',
};
const cache = new Map();
function encodingFor(header, compressed) {
  const accepted = String(header || '')
    .split(',')
    .map((item) => {
      const [name, ...parameters] = item.trim().split(';');
      const quality = parameters.find((value) => value.trim().startsWith('q='));
      return { name: name.trim(), q: quality ? Number(quality.trim().slice(2)) : 1 };
    });
  return ['br', 'gzip']
    .map((name) => ({
      name,
      q:
        (accepted.find((item) => item.name === name) || accepted.find((item) => item.name === '*'))
          ?.q || 0,
    }))
    .filter((item) => item.q > 0 && item.q <= 1 && compressed[item.name])
    .sort((a, b) => b.q - a.q)[0]?.name;
}
function serveAsset(req, res, version) {
  const name = req.urlObj.pathname.slice(1);
  const mime = assets[name];
  if (!mime) return false;
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Methode niet toegestaan');
    return true;
  }
  const file = path.join(__dirname, '..', 'public', name);
  const stat = fs.statSync(file);
  const signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  let asset = cache.get(name);
  if (asset?.signature !== signature) {
    const identity = fs.readFileSync(file);
    const compressed = { identity };
    if (/text|javascript|json|svg/.test(mime) && identity.length >= 512) {
      compressed.gzip = zlib.gzipSync(identity);
      compressed.br = zlib.brotliCompressSync(identity, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 },
      });
    }
    asset = {
      signature,
      compressed,
      etags: Object.fromEntries(
        Object.entries(compressed).map(([key, body]) => [
          key,
          `"${crypto.createHash('sha256').update(body).digest('base64url')}"`,
        ]),
      ),
    };
    cache.set(name, asset);
  }
  const encoding = encodingFor(req.headers['accept-encoding'], asset.compressed);
  const body = asset.compressed[encoding || 'identity'];
  const etag = asset.etags[encoding || 'identity'];
  res.setHeader(
    'Content-Type',
    `${mime}${/text|javascript|json|svg/.test(mime) ? '; charset=utf-8' : ''}`,
  );
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('ETag', etag);
  if (!req.admin) {
    const versioned = req.urlObj.searchParams.get('v') === version && name !== 'sw.js';
    res.setHeader(
      'Cache-Control',
      name === 'sw.js'
        ? 'no-cache'
        : versioned
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
    );
  }
  if (name === 'sw.js') res.setHeader('Service-Worker-Allowed', '/');
  if (name === 'offline.html') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (
    !req.admin &&
    String(req.headers['if-none-match'] || '')
      .split(',')
      .some((value) => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')
  ) {
    res.writeHead(304);
    res.end();
    return true;
  }
  if (encoding) res.setHeader('Content-Encoding', encoding);
  res.setHeader('Content-Length', body.length);
  res.writeHead(200);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
module.exports = { serveAsset };
