// A single Node process runs one mutation at a time. Unlike a response-close
// listener, finally waits for database work even when a client disconnects.
// Keep Render at one instance; see README before introducing multiple workers.
let writeTail = Promise.resolve();
export function mutate(app, method, path, ...handlers) {
  const handler = handlers.pop();
  app[method](path, ...handlers, async (req, res, next) => {
    const previous = writeTail;
    let release;
    writeTail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (!res.destroyed) await handler(req, res, next);
    } catch (error) {
      next(error);
    } finally {
      release();
    }
  });
}
