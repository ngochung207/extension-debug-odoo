// Functions injected into the Odoo tab (MAIN world) via chrome.scripting.executeScript.
// Each must be self-contained: only its source text is sent to the page.

export function pageRpcLog() {
  return window.__odooDebugHook?.buf.slice() || [];
}

/** POSTs `body` (JSON text) to `route` with the page's session, unhooked: a resent request stays out of the log. */
export async function pageSend(route, body) {
  const f = window.__odooDebugHook?.fetch || window.fetch;
  const t0 = performance.now();
  try {
    const r = await f(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return { status: r.status, text: await r.text(), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { error: String(e) };
  }
}
