function getSiteUrl(req) {
  const configured = process.env.SITE_URL;
  if (configured) {
    const siteUrl = new URL(configured);
    siteUrl.pathname = '/';
    siteUrl.search = '';
    siteUrl.hash = '';
    return siteUrl.toString();
  }
  if (!req) return 'http://localhost/';
  const proto =
    firstForwardedValue(req.headers['x-forwarded-proto']) ||
    (req.socket.encrypted ? 'https' : 'http');
  const host =
    firstForwardedValue(req.headers['x-forwarded-host']) ||
    firstForwardedValue(req.headers.host) ||
    'localhost';
  return `${proto}://${host}/`;
}
function firstForwardedValue(value = '') {
  const header = Array.isArray(value) ? value[0] : value;
  return String(header || '')
    .split(',')[0]
    .trim();
}
function redirectToCanonicalOrigin(req, res) {
  if (!process.env.SITE_URL) return false;

  const canonical = new URL(getSiteUrl());
  const requestProtocol =
    firstForwardedValue(req.headers['x-forwarded-proto']) ||
    (req.socket.encrypted ? 'https' : 'http');
  const requestHost =
    firstForwardedValue(req.headers['x-forwarded-host']) || firstForwardedValue(req.headers.host);
  if (
    !requestHost ||
    (requestProtocol === canonical.protocol.slice(0, -1) &&
      requestHost.toLowerCase() === canonical.host.toLowerCase())
  )
    return false;

  const target = new URL(canonical);
  target.pathname = req.urlObj.pathname;
  target.search = req.urlObj.search;
  res.writeHead(308, { Location: target.toString() });
  res.end();
  return true;
}

module.exports = { getSiteUrl, redirectToCanonicalOrigin };
