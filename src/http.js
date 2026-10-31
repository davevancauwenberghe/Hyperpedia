const { contentSecurityPolicy } = require('./security');
function redirect(res, to, code = 302) {
  res.writeHead(code, { Location: to });
  res.end();
}
function send(res, html, code = 200, type = 'text/html; charset=utf-8') {
  if (type.startsWith('text/html')) contentSecurityPolicy(res, html);
  res.writeHead(code, { 'Content-Type': type });
  res.end(res.req?.method === 'HEAD' ? undefined : html);
}

module.exports = { send, redirect };
