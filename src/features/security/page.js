// Functions injected into the Odoo tab (MAIN world) via chrome.scripting.executeScript.
// Each must be self-contained: only its source text is sent to the page.

// Evaluates ir.rule domain_force strings with Odoo's own JS Python evaluator (py_js).
export function pageEvalDomains(exprs, ctx) {
  const N_ = (s) => s; // error msgids, translated by the panel
  const py = window.odoo?.loader?.modules?.get('@web/core/py_js/py');
  if (!py) return exprs.map(() => ({ error: N_('py_js is not loaded') }));
  return exprs.map((e) => {
    try { return { domain: py.evaluateExpr(e || '[]', ctx) }; } catch (err) { return { error: String(err?.message || err) }; }
  });
}

// Read-only probe of web-facing security settings, same-origin so every response header is readable.
export async function pageProbe() {
  const f = window.__odooDebugHook?.fetch || window.fetch;
  const post = (url) => f(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: {} }),
  }).then((r) => r.json()).catch(() => ({}));
  const H = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'server', 'x-powered-by'];
  const page = await f(location.href, { cache: 'no-store' });
  const out = { host: location.hostname, protocol: location.protocol, headers: Object.fromEntries(H.map((h) => [h, page.headers.get(h)])) };
  try {
    const m = await f('/web/database/manager', { cache: 'no-store' });
    const t = m.ok ? await m.text() : '';
    out.manager = {
      status: m.status,
      reachable: t.includes('o_database_list'), // not a proxy block / redirect to login
      disabled: t.includes('has been disabled'),
      insecure: t.includes('manager is not protected'),
    };
  } catch (e) { out.manager = { error: String(e) }; }
  out.dbList = (await post('/web/database/list')).result ?? null;
  out.version = (await post('/web/webclient/version_info')).result?.server_version ?? null;
  return out;
}
