const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validatePathDefinitions } = require('./reading');

const dataDir = process.env.DATA_DIR || '/data';
fs.mkdirSync(dataDir, { recursive: true });
const storePath = path.join(dataDir, 'hyperpedia-posts.json');
const legacyStorePath = path.join(dataDir, 'hyper-posts.json');
const adminPath = path.join(dataDir, 'hyperpedia-admin.json');
const legacyAdminPath = path.join(dataDir, 'hyper-admin.json');
const readMetricsPath = path.join(dataDir, 'hyperpedia-read-metrics.json');
const readingPathsPath = path.join(dataDir, 'hyperpedia-reading-paths.json');

const jsonCache = new Map();
function readJson(file, fallback) {
  try {
    const stat = fs.statSync(file, { bigint: true });
    const signature = `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    const cached = jsonCache.get(file);
    if (cached?.signature === signature) return structuredClone(cached.value);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    jsonCache.set(file, { signature, value });
    return structuredClone(value);
  } catch (error) {
    jsonCache.delete(file);
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw error; // Never replace an unreadable/corrupt archive with an empty store.
  }
}
function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2));
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(tmp, file);
    jsonCache.delete(file);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
function readJsonWithLegacy(file, legacyFile, fallback) {
  if (fs.existsSync(file)) return readJson(file, fallback);
  return readJson(legacyFile, fallback);
}
function normalizePost(post) {
  const { read_count, read_metrics_version, ...content } = post;
  return { ...content, title: content.title || '', author: content.author || 'Onbekend', body: content.body || '', labels: content.labels || [], replies: content.replies || [] };
}
function validatePosts(posts) {
  if (!Array.isArray(posts)) throw new Error('Invalid archive: posts must be an array.');
  const ids = new Set();
  for (const post of posts) {
    if (!post || typeof post.id !== 'string' || !post.id || ids.has(post.id) ||
      ['title', 'author', 'body'].some(field => post[field] != null && typeof post[field] !== 'string') ||
      (post.labels != null && (!Array.isArray(post.labels) || post.labels.some(label => typeof label !== 'string'))) ||
      (post.replies != null && (!Array.isArray(post.replies) || post.replies.some(reply => !reply || ['body', 'author', 'originalReplier'].some(field => reply[field] != null && typeof reply[field] !== 'string'))))) {
      throw new Error('Invalid archive record. Restore or repair the archive before editing.');
    }
    ids.add(post.id);
  }
  return posts;
}
function rawPosts() {
  const stored = readJsonWithLegacy(storePath, legacyStorePath, { posts: [] });
  return validatePosts(stored?.posts);
}
function allPosts() { return rawPosts().map(normalizePost); }
function getPathDefinitions() { return validatePathDefinitions(readJson(readingPathsPath, { paths: [] }).paths); }
function savePathDefinitions(definitions) {
  validatePathDefinitions(definitions);
  getPathDefinitions(); // A corrupt existing file must never be silently replaced.
  writeJson(readingPathsPath, { schemaVersion: 1, paths: definitions });
}
function savePosts(posts) {
  validatePosts(posts);
  const previous = rawPosts();
  migrateEmbeddedReadCounts(previous, getReadMetrics());
  writeJson(storePath, { posts: posts.map(normalizePost) });
}
function getReadMetrics() {
  const stored = readJson(readMetricsPath, { posts: {} });
  if (!stored || !stored.posts || typeof stored.posts !== 'object' || Array.isArray(stored.posts)) throw new Error('Invalid read metrics store.');
  return { ...stored, posts: Object.assign(Object.create(null), stored.posts) };
}
function saveReadMetrics(metrics) { writeJson(readMetricsPath, { posts: metrics.posts || {} }); }
function purgePostRead(id) {
  const metrics = getReadMetrics();
  const existed = Object.prototype.hasOwnProperty.call(metrics.posts || {}, id);
  metrics.posts[id] = { read_count: 0, purged_at: new Date().toISOString() };
  saveReadMetrics(metrics);
  return existed;
}
function metricCount(metrics, id) { const count = Number(metrics.posts?.[id]?.read_count || 0); return Number.isSafeInteger(count) && count >= 0 ? count : 0; }
function migrateEmbeddedReadCounts(posts, metrics) {
  let changed = false;
  for (const post of posts) {
    const embeddedCount = Number(post.read_count || 0);
    if (!Object.prototype.hasOwnProperty.call(metrics.posts || {}, post.id) && Number.isSafeInteger(embeddedCount) && embeddedCount > 0) {
      metrics.posts[post.id] = { read_count: embeddedCount };
      changed = true;
    }
  }
  if (changed) saveReadMetrics(metrics);
  return metrics;
}
function recordPostRead(id) {
  const postsFromDisk = rawPosts();
  const post = postsFromDisk.find(item => item.id === id);
  if (!post) return null;
  const metrics = migrateEmbeddedReadCounts(postsFromDisk, getReadMetrics());
  metrics.posts[id] = { read_count: metricCount(metrics, id) + 1 };
  saveReadMetrics(metrics);
  return { ...normalizePost(post), read_count: metrics.posts[id].read_count };
}
function getStats() {
  const postsFromDisk = rawPosts();
  const metrics = migrateEmbeddedReadCounts(postsFromDisk, getReadMetrics());
  const posts = postsFromDisk.map(normalizePost);
  const replyCount = posts.reduce((total, post) => total + (post.replies || []).length, 0);
  const readCount = posts.reduce((total, post) => total + metricCount(metrics, post.id), 0);
  const postReads = posts
    .map(post => ({ id: post.id, title: post.title, author: post.author, read_count: metricCount(metrics, post.id) }))
    .filter(post => post.read_count > 0)
    .sort((a, b) => b.read_count - a.read_count || String(a.title || '').localeCompare(String(b.title || ''), 'nl'));
  return { postCount: posts.length, readCount, replyCount, postReads };
}
function getAdmin() { return readJsonWithLegacy(adminPath, legacyAdminPath, null); }
function saveAdmin(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 310000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
  writeJson(adminPath, { username, salt, iterations, hash, algorithm: 'pbkdf2-sha256' });
}
function passwordRecordValid(admin) {
  return Boolean(admin && typeof admin.salt === 'string' && /^[a-f0-9]{32,}$/i.test(admin.salt) &&
    Number.isInteger(admin.iterations) && admin.iterations > 0 && admin.iterations <= 2_000_000 &&
    typeof admin.hash === 'string' && /^[a-f0-9]{64}$/i.test(admin.hash));
}
function verifyPassword(password, admin) {
  if (!passwordRecordValid(admin)) return false;
  const hash = crypto.pbkdf2Sync(password, admin.salt, admin.iterations, 32, 'sha256');
  return crypto.timingSafeEqual(hash, Buffer.from(admin.hash, 'hex'));
}
async function verifyPasswordAsync(password, admin) {
  if (!passwordRecordValid(admin)) return false;
  const hash = await new Promise((resolve, reject) => crypto.pbkdf2(password, admin.salt, admin.iterations, 32, 'sha256', (error, result) => error ? reject(error) : resolve(result)));
  return crypto.timingSafeEqual(hash, Buffer.from(admin.hash, 'hex'));
}
module.exports = { allPosts, savePosts, recordPostRead, purgePostRead, getStats, getAdmin, saveAdmin, verifyPassword, verifyPasswordAsync, getPathDefinitions, savePathDefinitions };
