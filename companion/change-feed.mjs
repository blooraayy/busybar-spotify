// Bounded long-poll clients. No history or per-track cache is retained here.
export function createChangeFeed(snapshot, { timeoutMs = 1500, maxWaiters = 4 } = {}) {
  const waiters = new Map();
  const cancelled = new Map();
  function reply(res, status, current) {
    const headers = { 'Cache-Control': 'no-store', 'X-Busybar-Events': '1', Connection: 'close' };
    if (current) headers.ETag = current.tag;
    if (status === 200) headers['Content-Type'] = 'application/json; charset=utf-8';
    res.writeHead(status, headers);
    res.end(status === 200 ? JSON.stringify(current.data) : undefined);
  }
  function finish(client, status, current) {
    const waiter = waiters.get(client);
    if (!waiter) return;
    waiters.delete(client);
    clearTimeout(waiter.timer);
    waiter.res.off('close', waiter.close);
    if (!waiter.res.destroyed) reply(waiter.res, status, current);
  }
  function get(req, res) {
    const current = snapshot();
    const client = req.headers['x-busybar-client'];
    const tag = req.headers['if-none-match'];
    if (typeof client !== 'string' || !/^[a-z0-9-]{1,64}$/.test(client)) {
      reply(res, tag === current.tag ? 304 : 200, current); return;
    }
    if (cancelled.has(client) && Date.now() - cancelled.get(client) < 30000) { reply(res, 204); return; }
    if (req.headers['x-busybar-wait'] !== '1' || tag !== current.tag) { reply(res, tag === current.tag ? 304 : 200, current); return; }
    // Replace an older request from the same launch rather than queueing it.
    finish(client, 204);
    if (waiters.size >= maxWaiters) { reply(res, 503); return; }
    const close = () => {
      const waiter = waiters.get(client);
      if (waiter?.res === res) { clearTimeout(waiter.timer); waiters.delete(client); }
    };
    const timer = setTimeout(() => {
      const next = snapshot();
      finish(client, next.tag === tag ? 304 : 200, next);
    }, timeoutMs);
    waiters.set(client, { res, tag, timer, close });
    res.once('close', close);
  }
  function notify() {
    const current = snapshot();
    for (const [client, waiter] of waiters) if (waiter.tag !== current.tag) finish(client, 200, current);
  }
  function cancel(client) {
    if (typeof client !== 'string' || !/^[a-z0-9-]{1,64}$/.test(client)) return;
    if (cancelled.size >= 16) cancelled.delete(cancelled.keys().next().value);
    cancelled.set(client, Date.now());
    finish(client, 204);
  }
  function close() { for (const client of waiters.keys()) finish(client, 204); cancelled.clear(); }
  return { get, notify, cancel, close, get size() { return waiters.size; } };
}
