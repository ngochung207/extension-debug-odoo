// Pure helpers, no chrome.* / DOM: tested by the *.test.mjs next to this file.

/** Raw entry from hook.js → RPC log entry (request + response parsed), or null if it isn't an Odoo RPC. */
export function parseRpc(raw) {
  if (raw.method !== 'POST') return null;
  const path = new URL(raw.url).pathname;
  let body = null;
  try { body = JSON.parse(raw.body || ''); } catch { /* not JSON, or cut by hook.js (> 200 KB) */ }
  const base = { path, ms: raw.ms || 0, status: raw.status || 0, at: raw.at, ...parseRpcResponse(raw.response ?? '', raw.status) };
  // A cut body can't be parsed: show its beginning, take model/method from the URL.
  const head = typeof raw.body === 'string' ? `${raw.body.slice(0, 2000)}…` : null;

  const j2 = path.match(/^\/json\/2\/([^/]+)\/([^/]+)/); // Odoo 19 JSON-2 API
  if (j2) return { ...base, model: j2[1], method: j2[2], args: body ?? head, kwargs: null };

  const kw = path.match(/\/call_(?:kw|button)\/([^/]+)\/([^/]+)/);
  if (!body) return kw ? { ...base, model: kw[1], method: kw[2], args: head, kwargs: null } : null;
  if (body.jsonrpc !== '2.0') return null;
  const p = body.params || {};
  if (p.model && p.method) return { ...base, model: p.model, method: p.method, args: p.args, kwargs: p.kwargs };
  return { ...base, model: '', method: path, args: p, kwargs: null }; // other JSON routes: show raw params
}

/** Response body text → { result } | { error, traceback }. */
export function parseRpcResponse(text, status) {
  let j;
  try { j = JSON.parse(text); } catch { return status >= 400 ? { error: `HTTP ${status}` } : { result: text }; }
  if (j?.jsonrpc) {
    return j.error
      ? { error: j.error.data?.message || j.error.message, traceback: j.error.data?.debug, errorType: j.error.data?.name }
      : { result: j.result };
  }
  if (status >= 400) return { error: j?.message || `HTTP ${status}`, traceback: j?.debug, errorType: j?.name }; // JSON-2 error shape
  return { result: j };
}
