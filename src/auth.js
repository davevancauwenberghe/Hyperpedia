const crypto = require('node:crypto');
const net = require('node:net');
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const LOGIN_LOCK_MS = 60_000;

function createAuth() {
  let secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    console.warn(
      'SESSION_SECRET is missing or too short; using an ephemeral session secret. Set SESSION_SECRET for stable cookie signing.',
    );
    secret = crypto.randomBytes(48).toString('base64url');
  }
  const sessions = new Map();
  const attempts = new Map();
  const pending = new Set();
  let lastCleanup = 0;
  const sign = (value) =>
    crypto.createHmac('sha256', secret).update(value).digest('hex');
  const cleanup = (now = Date.now()) => {
    if (now - lastCleanup < 60_000) return;
    for (const [key, expires] of sessions)
      if (expires <= now) sessions.delete(key);
    for (const [key, attempt] of attempts)
      if (attempt.expiresAt <= now) attempts.delete(key);
    lastCleanup = now;
  };
  function authenticate(req) {
    cleanup();
    const cookie = String(req.headers.cookie || '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('hyperpedia_session='));
    let value = '';
    try {
      value = decodeURIComponent(
        cookie?.slice('hyperpedia_session='.length) || '',
      );
    } catch {}
    const [id, signature] = value.split('.');
    const valid =
      /^[a-f0-9]{64}$/.test(id || '') &&
      /^[a-f0-9]{64}$/.test(signature || '') &&
      crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(sign(id), 'hex'),
      );
    req.admin = Boolean(valid && sessions.get(id) > Date.now());
    req.sessionId = req.admin ? id : undefined;
  }
  function loginKey(req) {
    // Fly supplies this header. Untrusted forwarded headers cannot bypass a local limit.
    const flyIp = process.env.FLY_APP_NAME && req.headers['fly-client-ip'];
    return typeof flyIp === 'string' && net.isIP(flyIp)
      ? flyIp
      : req.socket.remoteAddress || 'unknown';
  }
  function attemptFor(key) {
    cleanup();
    const attempt = attempts.get(key);
    if (
      attempt &&
      (attempt.expiresAt <= Date.now() ||
        (attempt.lockedUntil && attempt.lockedUntil <= Date.now()))
    ) {
      attempts.delete(key);
      return undefined;
    }
    return attempt;
  }
  function beginLogin(key) {
    const lockedUntil = attemptFor(key)?.lockedUntil || 0;
    if (lockedUntil > Date.now())
      return Math.ceil((lockedUntil - Date.now()) / 1000);
    if (pending.has(key) || pending.size >= 4) return 1;
    pending.add(key);
    return 0;
  }
  function endLogin(key, succeeded) {
    pending.delete(key);
    if (succeeded) {
      attempts.delete(key);
      return 0;
    }
    const now = Date.now();
    const failures = (attemptFor(key)?.failures || 0) + 1;
    const lockedUntil = failures >= 2 ? now + LOGIN_LOCK_MS : 0;
    attempts.set(key, { failures, lockedUntil, expiresAt: now + 15 * 60_000 });
    return lockedUntil ? 60 : 0;
  }
  function createSession(req) {
    if (req.sessionId) sessions.delete(req.sessionId);
    const id = crypto.randomBytes(32).toString('hex');
    sessions.set(id, Date.now() + SESSION_TTL);
    return `hyperpedia_session=${id}.${sign(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  }
  function logout(req) {
    sessions.delete(req.sessionId);
    return `hyperpedia_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  }
  return {
    authenticate,
    loginKey,
    beginLogin,
    endLogin,
    cancelLogin: (key) => pending.delete(key),
    createSession,
    logout,
  };
}
module.exports = { createAuth };
