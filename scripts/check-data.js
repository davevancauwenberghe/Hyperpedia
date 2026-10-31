// Read-only verification: never print story contents, names or password hashes.
try {
  const { inspectExistingData } = require('../src/store');
  console.log(JSON.stringify(inspectExistingData(), null, 2));
} catch (error) {
  const message = error instanceof SyntaxError
    ? 'A data file contains invalid JSON. Restore or repair it before deployment.'
    : error.message;
  console.error(`Data check failed: ${message}`);
  process.exitCode = 1;
}
