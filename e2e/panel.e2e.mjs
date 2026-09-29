// End-to-end: the unpacked extension in Chrome (Puppeteer) against a real Odoo (e2e/compose.yml).
//   ODOO_VERSION=19 docker compose -f e2e/compose.yml up -d --wait && npm run e2e
// ODOO_URL (default http://localhost:8069), ODOO_DB / ODOO_LOGIN / ODOO_PASSWORD (default e2e / admin / admin, as in compose.yml).
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import puppeteer from 'puppeteer';

const ODOO = process.env.ODOO_URL || 'http://localhost:8069';
const EXT = new URL('../extension', import.meta.url).pathname;
const ext = (s) => String(s).includes('chrome-extension://');

let browser, page, panel;
const errors = []; // uncaught errors, console.error and failed loads of the extension (the Odoo page's own ones are not ours)

/** Listens to an extension target (panel iframe, service worker): Puppeteer's page events don't cover them.
 * Log.enable replays what was logged before, e.g. a module that failed to load. */
const watched = new Set();
async function watch(target) {
  const url = target.url();
  if (!url.startsWith('chrome-extension://') || watched.has(target)) return;
  watched.add(target);
  const s = await target.createCDPSession();
  s.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => errors.push(`${url}: ${d.exception?.description || d.text}`));
  s.on('Runtime.consoleAPICalled', (e) => e.type === 'error' && errors.push(`${url}: ${e.args.map((a) => a.value ?? a.description).join(' ')}`));
  s.on('Log.entryAdded', ({ entry: e }) => e.level === 'error' && errors.push(`${url}: ${e.text} ${e.url || ''}`));
  await Promise.all([s.send('Runtime.enable'), s.send('Log.enable')]);
}

before(async () => {
  browser = await puppeteer.launch({ enableExtensions: [EXT], pipe: true, args: ['--window-size=1400,900'] });
  browser.on('targetcreated', watch);
  browser.on('targetchanged', watch); // an iframe target gets its URL after it is created
  await Promise.all(browser.targets().map(watch));
  page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('pageerror', (e) => ext(e.stack) && errors.push(`page: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && ext(m.location()?.url) && errors.push(`console: ${m.text()}`));

  // A fresh Odoo 19 database: the first webclient load stays blank, and so does every later one in the same browser
  // profile (without the extension too). Take that first load in a throwaway context, then log in for real.
  const warmup = await browser.createBrowserContext();
  await openUserForm(await warmup.newPage(), 20_000).catch(() => {});
  await warmup.close();
  await openUserForm(page, 120_000);
});

/** Logs in and opens the Administrator's user form. */
async function openUserForm(p, timeout) {
  await p.goto(`${ODOO}/web/login`);
  const uid = await p.evaluate(async (params) => { // not the login form: typing in it is flaky, this sets the same cookie
    const r = await fetch('/web/session/authenticate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', params }),
    }).then((res) => res.json());
    return r.result?.uid ?? JSON.stringify(r.error?.data?.message || r.error);
  }, { db: process.env.ODOO_DB || 'e2e', login: process.env.ODOO_LOGIN || 'admin', password: process.env.ODOO_PASSWORD || 'admin' });
  assert.equal(typeof uid, 'number', `login: ${uid}`);
  await p.goto(`${ODOO}/odoo/action-base.action_res_users/2`);
  await p.waitForSelector('.o_form_view', { timeout });
}

after(() => browser?.close());

test('the button appears on the Odoo page and opens the panel', async () => {
  await page.waitForSelector('odoo-debug-root'); // its shadow root is closed: click the button where it sits
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  await page.mouse.click(w - 16 - 20, h - 8 - 20); // default spot: bottom right, 16px from the side, 8px above the edge
  panel = await page.waitForFrame((f) => f.url().endsWith('/src/panel/panel.html'), { timeout: 15_000 });
  await Promise.all(browser.targets().map(watch));
  await panel.waitForFunction(() => document.querySelector('#status')?.textContent.includes('res.users'), { timeout: 15_000 });
});

test('every tab opens its cards without an error', async () => {
  const tabs = await panel.$$eval('.tabs button', (bs) => bs.map((b) => b.dataset.tab));
  assert.ok(tabs.length >= 9, `tabs: ${tabs}`);
  for (const tab of tabs) {
    await panel.click(`.tabs [data-tab="${tab}"]`);
    await panel.$$eval(`#${tab} details.card`, (cards) => cards.forEach((c) => { c.open = true; }));
    await panel.waitForFunction((t) => [...document.querySelectorAll(`#${t} .card-body`)] // opened cards fill in async
      .every((b) => b.childElementCount && !b.querySelector(':scope > .loading')), { timeout: 30_000 }, tab);
    const failed = await panel.$$eval(`#${tab} .card-body > .error, #${tab} > .empty`, (ns) => ns.filter((n) => !n.hidden).map((n) => n.textContent));
    assert.deepEqual(failed, [], `${tab} tab`);
  }
});

test('RPC tab: the calls the webclient made to load the form are listed', async () => {
  await panel.click('.tabs [data-tab="rpc"]');
  const methods = await panel.$$eval('#rpc .list .name', (ns) => ns.map((n) => n.textContent));
  assert.ok(methods.includes('web_read'), `methods: ${methods}`);
});

test('Code tab: a search runs as the logged-in user, writes are blocked by default', async () => {
  const run = async (code) => {
    await panel.click('.tabs [data-tab="code"]');
    await panel.$eval('#code details.card', (c) => { c.open = true; });
    await panel.waitForSelector('#code textarea.code');
    await panel.$eval('#code textarea.code', (t, v) => { t.value = v; }, code);
    await panel.click('#code .console .btn');
    await panel.waitForFunction(() => {
      const o = document.querySelector('#code .output');
      return o.childElementCount && !o.querySelector('.loading');
    }, { timeout: 15_000 });
    return panel.$eval('#code .output', (o) => ({
      status: o.querySelector('.pill')?.textContent, // ok / error
      value: o.querySelector(':scope > pre.mt')?.textContent, // a single value
      cells: [...o.querySelectorAll(':scope > div.mt td')].map((td) => td.textContent), // a list of records: a table
      error: o.querySelector(':scope > .error')?.textContent,
    }));
  };

  const read = await run("const u = await env['res.users'].search([['id', '=', env.uid]]);\nreturn u.read(['login']);");
  assert.equal(read.status, 'ok', read.error);
  assert.ok(read.cells.includes('admin'), `cells: ${read.cells}`);

  const field = await run("const u = await env['res.users'].search([['id', '=', env.uid]]);\nreturn u.login;"); // read like in Python
  assert.equal(field.status, 'ok', field.error);
  assert.match(field.value, /^"?admin"?$/);

  const write = await run("return env['res.partner'].create({ name: 'e2e' });");
  assert.equal(write.status, 'error');
  const count = await run("return env['res.partner'].search_count([['name', '=', 'e2e']]);");
  assert.deepEqual([count.status, count.value], ['ok', '0'], 'the blocked create never reached the server');
});

test('no error from the extension in the console', () => {
  assert.deepEqual(errors, []);
});
