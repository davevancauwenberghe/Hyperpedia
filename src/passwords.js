const crypto = require('node:crypto');

const PASSWORD_ITERATIONS = 600_000;
const MIN_PASSWORD_LENGTH = 16;
const dummy = {
  salt: crypto.randomBytes(16).toString('hex'),
  iterations: PASSWORD_ITERATIONS,
  hash: crypto.randomBytes(32).toString('hex'),
};

function passwordRecordValid(record) {
  return Boolean(
    record &&
    (record.algorithm == null || record.algorithm === 'pbkdf2-sha256') &&
    typeof record.salt === 'string' &&
    /^[a-f0-9]{32,}$/i.test(record.salt) &&
    Number.isInteger(record.iterations) &&
    record.iterations > 0 &&
    record.iterations <= 2_000_000 &&
    typeof record.hash === 'string' &&
    /^[a-f0-9]{64}$/i.test(record.hash),
  );
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('hex');
  return { salt, iterations: PASSWORD_ITERATIONS, hash, algorithm: 'pbkdf2-sha256' };
}
function derive(password, record) {
  return new Promise((resolve, reject) =>
    crypto.pbkdf2(password, record.salt, record.iterations, 32, 'sha256', (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );
}
async function hashPasswordAsync(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await derive(password, { salt, iterations: PASSWORD_ITERATIONS })).toString('hex');
  return { salt, iterations: PASSWORD_ITERATIONS, hash, algorithm: 'pbkdf2-sha256' };
}
function verifyPassword(password, record) {
  if (!passwordRecordValid(record) || typeof password !== 'string') return false;
  const hash = crypto.pbkdf2Sync(password, record.salt, record.iterations, 32, 'sha256');
  return crypto.timingSafeEqual(hash, Buffer.from(record.hash, 'hex'));
}
async function verifyPasswordAsync(password, record) {
  const valid = passwordRecordValid(record) && typeof password === 'string';
  const target = valid ? record : dummy;
  const hash = await derive(typeof password === 'string' ? password : '', target);
  return crypto.timingSafeEqual(hash, Buffer.from(target.hash, 'hex')) && valid;
}
module.exports = {
  PASSWORD_ITERATIONS,
  MIN_PASSWORD_LENGTH,
  passwordRecordValid,
  hashPassword,
  hashPasswordAsync,
  verifyPassword,
  verifyPasswordAsync,
};
