// RPC tab, functions run IN the Odoo page (MAIN world): only each function's own source text reaches it (npm run
// check:page), no chrome.* (tsconfig.page.json).
import type { RawRpc } from '../../contracts/messages.ts';

/** What the page recorded before the panel opened (entrypoints/rpc-recorder keeps the last 300 calls). */
export function pageRpcLog(): RawRpc[] {
  return window.__odooDebugHook?.buf.slice() || [];
}

/** POSTs `body` (JSON text) to `route` with the page's session, on the unwrapped fetch: a resent request stays out of
 * the log. */
export async function pageSend(route: string, body: string): Promise<{ status: number; text: string; ms: number } | { error: string }> {
  const f = window.__odooDebugHook?.fetch || window.fetch;
  const t0 = performance.now();
  try {
    const r = await f(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    return { status: r.status, text: await r.text(), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { error: String(e) };
  }
}
