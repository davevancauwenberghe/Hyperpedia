const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validatePathDefinitions } = require('./reading');
const {
  PASSWORD_ITERATIONS,
  passwordRecordValid,
  hashPassword,
  hashPasswordAsync,
  verifyPassword,
  verifyPasswordAsync,
} = require('./passwords');

const dataDir = process.env.DATA_DIR || '/data';
fs.mkdirSync(dataDir, { recursive: true });
const storePath = path.join(dataDir, 'hyperpedia-posts.json');
const legacyStorePath = path.join(dataDir, 'hyper-posts.json');
const adminPath = path.join(dataDir, 'hyperpedia-admin.json');
const legacyAdminPath = path.join(dataDir, 'hyper-admin.json');
const readMetricsPath = path.join(dataDir, 'hyperpedia-read-metrics.json');
const readingPathsPath = path.join(dataDir, 'hyperpedia-reading-paths.json');

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const emptyArchive = freeze({ posts: [] });
const emptyPaths = freeze({ paths: [] });
const emptyMetrics = freeze({ posts: {} });
const jsonCache = new Map();
function readJson(file, fallback) {
  try {
    const stat = fs.statSync(file, { bigint: true });
    const signature = `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    const cached = jsonCache.get(file);
    if (cached?.signature === signature) return cached.value;
    const value = freeze(JSON.parse(fs.readFileSync(file, 'utf8')));
    jsonCache.set(file, { signature, value });
    return value;
  } catch (error) {
    jsonCache.delete(file);
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}
function atomicWrite(file, content) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(descriptor, content);
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
function writeJson(file, value) {
  atomicWrite(file, JSON.stringify(value, null, 2));
}
function readJsonWithLegacy(file, legacyFile, fallback) {
  const current = fs.existsSync(file);
  jsonCache.delete(current ? legacyFile : file);
  return readJson(current ? file : legacyFile, fallback);
}
function normalizePost(post) {
  const { read_count, read_metrics_version, ...content } = post;
  return {
    ...content,
    title: content.title || '',
    author: content.author || 'Onbekend',
    body: content.body || '',
    labels: content.labels || [],
    replies: content.replies || [],
  };
}
function validatePosts(posts) {
  if (!Array.isArray(posts)) throw new Error('Invalid archive: posts must be an array.');
  const ids = new Set();
  for (const post of posts) {
    if (
      !post ||
      typeof post.id !== 'string' ||
      !post.id ||
      ids.has(post.id) ||
      ['title', 'author', 'body'].some(
        (field) => post[field] != null && typeof post[field] !== 'string',
      ) ||
      (post.labels != null &&
        (!Array.isArray(post.labels) || post.labels.some((label) => typeof label !== 'string'))) ||
      (post.replies != null && !Array.isArray(post.replies))
    ) {
      throw new Error('Invalid archive record. Restore or repair the archive before editing.');
    }
    const replyIds = new Set();
    for (const reply of post.replies || []) {
      if (
        !reply ||
        ['body', 'author', 'originalReplier'].some(
          (field) => reply[field] != null && typeof reply[field] !== 'string',
        ) ||
        (reply.id != null && typeof reply.id !== 'string') ||
        (reply.id && replyIds.has(reply.id))
      ) {
        throw new Error(
          'Invalid archive reply or duplicate reply ID. Restore or repair the archive before editing.',
        );
      }
      if (reply.id) replyIds.add(reply.id);
    }
    ids.add(post.id);
  }
  return posts;
}
let archiveSource;
let archiveSnapshot;
function snapshot() {
  const stored = readJsonWithLegacy(storePath, legacyStorePath, emptyArchive);
  if (stored !== archiveSource) {
    const raw = validatePosts(stored?.posts);
    const posts = freeze(raw.map(normalizePost));
    archiveSnapshot = {
      raw,
      posts,
      byId: new Map(posts.map((post) => [post.id, post])),
      rawById: new Map(raw.map((post) => [post.id, post])),
    };
    archiveSource = stored;
  }
  return archiveSnapshot;
}
function allPosts() {
  return snapshot().posts;
}
function postsForEdit() {
  return structuredClone(allPosts());
}
function getPost(id) {
  return snapshot().byId.get(id);
}

let pathSource;
function getPathDefinitions() {
  const stored = readJson(readingPathsPath, emptyPaths);
  if (stored !== pathSource) {
    validatePathDefinitions(stored.paths);
    pathSource = stored;
  }
  return stored.paths;
}
function getPathExport() {
  try {
    return { readingPaths: getPathDefinitions(), warnings: [] };
  } catch {
    return {
      readingPaths: null,
      warnings: [
        {
          code: 'READING_PATHS_UNREADABLE',
          message:
            'Leesroutes konden niet worden gelezen. Alle verhalen en reacties zijn geëxporteerd. Bewaar of herstel hyperpedia-reading-paths.json afzonderlijk.',
        },
      ],
    };
  }
}
function savePathDefinitions(definitions) {
  validatePathDefinitions(definitions);
  getPathDefinitions();
  writeJson(readingPathsPath, { schemaVersion: 1, paths: definitions });
}
function backupPosts() {
  const source = fs.existsSync(storePath) ? storePath : legacyStorePath;
  if (!fs.existsSync(source)) return;
  // Five private pre-edit copies, including original legacy bytes.
  for (let index = 4; index >= 1; index--) {
    const previous = index === 1 ? `${storePath}.bak` : `${storePath}.bak.${index - 1}`;
    if (fs.existsSync(previous)) fs.renameSync(previous, `${storePath}.bak.${index}`);
  }
  atomicWrite(`${storePath}.bak`, fs.readFileSync(source));
}
function savePosts(posts) {
  validatePosts(posts);
  snapshot(); // A corrupt existing archive must never be overwritten.
  flushReadMetrics(); // Preserve embedded totals before stripping old fields.
  backupPosts();
  writeJson(storePath, { posts: posts.map(normalizePost) });
}

let metricsSource;
function getReadMetrics() {
  const stored = readJson(readMetricsPath, emptyMetrics);
  if (stored !== metricsSource) {
    if (
      !stored ||
      !stored.posts ||
      typeof stored.posts !== 'object' ||
      Array.isArray(stored.posts) ||
      Object.values(stored.posts).some(
        (value) =>
          !value ||
          typeof value !== 'object' ||
          !Number.isSafeInteger(value.read_count) ||
          value.read_count < 0,
      )
    ) {
      throw new Error('Invalid read metrics store.');
    }
    metricsSource = stored;
  }
  return stored;
}
const pendingReads = new Map();
function diskCount(metrics, post) {
  const stored = Object.prototype.hasOwnProperty.call(metrics.posts, post.id)
    ? metrics.posts[post.id].read_count
    : Number(post.read_count || 0);
  return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
}
function currentCount(metrics, post) {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    diskCount(metrics, post) + (pendingReads.get(post.id) || 0),
  );
}
function flushReadMetrics() {
  const raw = snapshot().raw;
  const metrics = getReadMetrics();
  const next = { posts: Object.assign(Object.create(null), metrics.posts) };
  let changed = pendingReads.size > 0;
  for (const post of raw) {
    const count = currentCount(metrics, post);
    if (
      pendingReads.has(post.id) ||
      (!Object.prototype.hasOwnProperty.call(next.posts, post.id) && count > 0)
    ) {
      next.posts[post.id] = { ...next.posts[post.id], read_count: count };
      changed = true;
    }
  }
  if (changed) writeJson(readMetricsPath, next);
  pendingReads.clear(); // A failed write leaves the pending counts retryable.
}
function recordPostRead(id) {
  const post = getPost(id);
  if (!post) return null;
  const count = currentCount(getReadMetrics(), archiveSnapshot.rawById.get(id));
  if (count < Number.MAX_SAFE_INTEGER) pendingReads.set(id, (pendingReads.get(id) || 0) + 1);
  return { ...post, read_count: Math.min(Number.MAX_SAFE_INTEGER, count + 1) };
}
function purgePostRead(id) {
  flushReadMetrics();
  const posts = Object.assign(Object.create(null), getReadMetrics().posts);
  posts[id] = { read_count: 0, purged_at: new Date().toISOString() };
  writeJson(readMetricsPath, { posts });
}
function getStats() {
  const { raw, posts } = snapshot();
  const metrics = getReadMetrics();
  const postReads = posts.map((post, index) => ({
    id: post.id,
    title: post.title,
    author: post.author,
    read_count: currentCount(metrics, raw[index]),
  }));
  return {
    postCount: posts.length,
    replyCount: posts.reduce((total, post) => total + post.replies.length, 0),
    readCount: postReads.reduce((total, post) => total + post.read_count, 0),
    postReads: postReads
      .filter((post) => post.read_count > 0)
      .sort((a, b) => b.read_count - a.read_count || a.title.localeCompare(b.title, 'nl')),
  };
}
let metricsTimer;
function startReadMetricsFlusher() {
  if (metricsTimer) return;
  metricsTimer = setInterval(() => {
    try {
      flushReadMetrics();
    } catch (error) {
      console.error('Could not flush read totals:', error.message);
    }
  }, 30_000);
  metricsTimer.unref();
}
function stopReadMetricsFlusher() {
  clearInterval(metricsTimer);
  metricsTimer = undefined;
}

function getAdmin() {
  return readJsonWithLegacy(adminPath, legacyAdminPath, null);
}
function saveAdmin(username, password) {
  writeJson(adminPath, { username, ...hashPassword(password) });
}
async function checkAdminCredentials(username, password) {
  const admin = getAdmin();
  // Derive for both known and unknown usernames with the same stored work factor.
  const passwordMatches = await verifyPasswordAsync(password, admin);
  if (!passwordMatches || admin?.username !== username || getAdmin() !== admin) return false;
  if (admin.iterations < PASSWORD_ITERATIONS) {
    const upgraded = await hashPasswordAsync(password);
    // Never overwrite a concurrent password reset or accept its old password.
    if (getAdmin() !== admin) return false;
    writeJson(adminPath, { username: admin.username, ...upgraded });
  }
  return true;
}
function inspectExistingData() {
  const posts = allPosts();
  if (!posts.length)
    throw new Error(
      `No stories found in ${dataDir}. Restore the existing archive before starting this deployment.`,
    );
  const admin = getAdmin();
  if (!passwordRecordValid(admin) || typeof admin.username !== 'string' || !admin.username.trim()) {
    throw new Error(
      `No valid administrator record found in ${dataDir}. Restore the original administrator file.`,
    );
  }
  getReadMetrics();
  const routes = getPathDefinitions();
  return {
    stories: posts.length,
    replies: posts.reduce((total, post) => total + post.replies.length, 0),
    curatedRoutes: routes.length,
    administrator: 'configured',
  };
}
if (process.env.REQUIRE_EXISTING_DATA === 'true') inspectExistingData();
module.exports = {
  allPosts,
  postsForEdit,
  getPost,
  savePosts,
  recordPostRead,
  flushReadMetrics,
  startReadMetricsFlusher,
  stopReadMetricsFlusher,
  purgePostRead,
  getStats,
  getAdmin,
  saveAdmin,
  checkAdminCredentials,
  verifyPassword,
  verifyPasswordAsync,
  getPathDefinitions,
  savePathDefinitions,
  getPathExport,
  inspectExistingData,
};
