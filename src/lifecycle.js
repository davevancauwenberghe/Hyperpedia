function installLifecycle(server, { flushReadMetrics, stopReadMetricsFlusher }) {
  let stopping = false;
  function shutdown(reason, code = 0) {
    if (stopping) return;
    stopping = true;
    console.log(`Stopping Hyperpedia (${reason}).`);
    stopReadMetricsFlusher();
    const deadline = setTimeout(() => {
      console.error('Graceful shutdown timed out.');
      server.closeAllConnections();
      try {
        flushReadMetrics();
      } catch (error) {
        console.error('Read totals could not be saved:', error.message);
      }
      process.exit(1);
    }, 10_000);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      try {
        flushReadMetrics();
      } catch (flushError) {
        console.error('Read totals could not be saved:', flushError.message);
        code = 1;
      }
      process.exit(error ? 1 : code);
    });
    server.closeIdleConnections();
  }
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (error) => {
    console.error(
      'Unhandled promise rejection:',
      error instanceof Error ? error.stack : String(error),
    );
    shutdown('unhandled rejection', 1);
  });
}
module.exports = { installLifecycle };
