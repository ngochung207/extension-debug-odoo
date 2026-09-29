// Shared by e2e/panel.e2e.mjs and tools/screenshots.mjs: the Odoo started by e2e/compose.yml, logged in from Puppeteer.
// ODOO_URL (default http://localhost:8069), ODOO_DB / ODOO_LOGIN / ODOO_PASSWORD (default e2e / admin / admin).
export const ODOO = process.env.ODOO_URL || 'http://localhost:8069';
export const EXT = new URL('../extension', import.meta.url).pathname;

/** JSON-RPC from the page `p` (same origin: its session cookie). Throws the server's message on an error. */
export async function rpc(p, route, params) {
  const r = await p.evaluate(async (route, params) => fetch(route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', params }),
  }).then((res) => res.json()), route, params);
  if (r.error) throw new Error(`${route}: ${r.error.data?.message || r.error.message}`);
  return r.result;
}

/** Logs `p` in (not through the login form: typing in it is flaky, this sets the same cookie). */
export async function login(p) {
  await p.goto(`${ODOO}/web/login`);
  await rpc(p, '/web/session/authenticate', {
    db: process.env.ODOO_DB || 'e2e', login: process.env.ODOO_LOGIN || 'admin', password: process.env.ODOO_PASSWORD || 'admin',
  });
}

/** Opens /odoo/<path> in `p` and waits for the form. A fresh Odoo 19 database leaves the first webclient load of a
 * browser profile blank (without the extension too), and every later one in that profile: that first load is taken
 * in a throwaway context first. */
export async function openForm(browser, p, path) {
  const warmup = await browser.createBrowserContext();
  const w = await warmup.newPage();
  await login(w).then(() => w.goto(`${ODOO}/odoo/${path}`)).then(() => w.waitForSelector('.o_form_view', { timeout: 20_000 })).catch(() => {});
  await warmup.close();
  await login(p);
  await p.goto(`${ODOO}/odoo/${path}`);
  await p.waitForSelector('.o_form_view', { timeout: 120_000 });
}

/** Clicks the Odoo Debug button (its shadow root is closed: where it sits by default) and returns the panel's frame. */
export async function openPanel(p) {
  await p.waitForSelector('odoo-debug-root');
  const { w, h } = await p.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  await p.mouse.click(w - 16 - 20, h - 8 - 20); // bottom right: 16px from the side, 8px above the edge
  return p.waitForFrame((f) => f.url().endsWith('/src/panel/panel.html'), { timeout: 15_000 });
}
