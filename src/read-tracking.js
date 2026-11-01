const crypto = require('node:crypto');

function createReadTracking({ store, clientKey, getSiteUrl, send, now = Date.now }) {
  const secret = crypto.randomBytes(32);
  const clients = new Map();
  const counted = new Map();
  let cleanedAt = 0;
  function cleanup(time, force = false) {
    if (!force && time - cleanedAt < 60_000) return;
    for (const [key, value] of clients) if (value.expires <= time) clients.delete(key);
    for (const [key, expires] of counted) if (expires <= time) counted.delete(key);
    cleanedAt = time;
  }
  function track(req, res) {
    const match = req.urlObj.pathname.match(/^\/posts\/([^/]+)\/read$/);
    if (req.method !== 'POST' || !match) return false;
    const id = decodeURIComponent(match[1]);
    const respond = (status, didCount = false) =>
      send(
        res,
        JSON.stringify({ ok: status === 200, counted: didCount }),
        status,
        'application/json; charset=utf-8',
      );
    if (!store.getPost(id)) {
      respond(404);
      return true;
    }
    if (req.admin) {
      respond(200);
      return true;
    }
    if (
      req.headers.origin !== new URL(getSiteUrl(req)).origin ||
      req.headers['x-hyperpedia-consent'] !== 'statistics'
    ) {
      respond(403);
      return true;
    }
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > 0) {
      res.setHeader('Connection', 'close');
      res.shouldKeepAlive = false;
      respond(413);
      return true;
    }
    const time = now();
    cleanup(time);
    // Only short-lived process-local digests; no IPs or visitor IDs are persisted.
    const address = clientKey(req);
    const client = crypto.createHmac('sha256', secret).update(address).digest('hex');
    const key = crypto
      .createHmac('sha256', secret)
      .update(address)
      .update('\0')
      .update(id)
      .digest('hex');
    if (counted.get(key) > time) {
      respond(200);
      return true;
    }
    let bucket = clients.get(client);
    if (!bucket || bucket.expires <= time) {
      if (!bucket && clients.size >= 2048) {
        res.setHeader('Retry-After', '60');
        respond(429);
        return true;
      }
      bucket = { count: 0, expires: time + 60_000 };
      clients.set(client, bucket);
    }
    if (bucket.count >= 30 || counted.size >= 8192) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.expires - time) / 1000))));
      respond(429);
      return true;
    }
    store.recordPostRead(id);
    bucket.count++;
    counted.set(key, time + 15 * 60_000);
    respond(200, true);
    return true;
  }
  track.cleanup = () => cleanup(now(), true);
  return track;
}
module.exports = { createReadTracking };
