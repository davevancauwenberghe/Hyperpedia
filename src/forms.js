const LOGIN_BODY_LIMITS = Object.freeze({
  maxBytes: 8 * 1024,
  timeoutMs: 5000,
  maxConcurrent: 16,
});

function bodyError(message, status) {
  return Object.assign(new Error(message), { status, closeConnection: true });
}

function readForm(req, { maxBytes = 1024 * 1024, timeoutMs = 0 } = {}) {
  if (Number(req.headers['content-length']) > maxBytes) {
    req.pause();
    return Promise.reject(bodyError('Formulier is te groot.', 413));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAborted);
      chunks.length = 0;
      if (error) {
        req.pause();
        reject(error);
      } else resolve(value);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > maxBytes) finish(bodyError('Formulier is te groot.', 413));
      else chunks.push(chunk);
    };
    const onEnd = () => {
      try {
        finish(
          null,
          Object.fromEntries(
            new URLSearchParams(Buffer.concat(chunks).toString('utf8')),
          ),
        );
      } catch (error) {
        finish(error);
      }
    };
    const onError = () => finish(bodyError('Verzoek afgebroken.', 400));
    const onAborted = () => finish(bodyError('Verzoek afgebroken.', 400));
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    // An absolute deadline also expires uploads that keep trickling in data.
    if (timeoutMs)
      timer = setTimeout(
        () => finish(bodyError('Inlogverzoek duurde te lang.', 408)),
        timeoutMs,
      );
  });
}

function createLoginBodyReader(limits = LOGIN_BODY_LIMITS) {
  const active = new Set();
  return async (req, key) => {
    if (active.has(key) || active.size >= limits.maxConcurrent) {
      req.pause();
      throw bodyError(
        'Te veel gelijktijdige inlogverzoeken. Probeer opnieuw.',
        429,
      );
    }
    active.add(key);
    try {
      return await readForm(req, limits);
    } finally {
      active.delete(key);
    }
  };
}

module.exports = { readForm, createLoginBodyReader, LOGIN_BODY_LIMITS };
