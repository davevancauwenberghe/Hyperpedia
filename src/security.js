const crypto = require('node:crypto');

function contentSecurityPolicy(res, html = '') {
  const hashes = [
    ...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
  ].map((match) => `'sha256-${crypto.createHash('sha256').update(match[1]).digest('base64')}'`);
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "script-src-attr 'none'",
    "style-src 'self'",
    "style-src-attr 'none'",
    "img-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  res.setHeader(
    process.env.CSP_REPORT_ONLY === 'true'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy',
    policy,
  );
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), web-share=(self)',
  );
  contentSecurityPolicy(res);
}
module.exports = { securityHeaders, contentSecurityPolicy };
