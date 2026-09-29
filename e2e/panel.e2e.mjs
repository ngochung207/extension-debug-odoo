// End-to-end: the unpacked extension in Chrome (Puppeteer) against a real Odoo (e2e/compose.yml).
//   ODOO_VERSION=19 docker compose -f e2e/compose.yml up -d --wait && npm run e2e
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import puppeteer from 'puppeteer';
import { EXT, openForm, openPanel } from './odoo.mjs';

const ext = (s) => String(s).includes('chrome-extension://');
// element.click(), not a mouse click: Puppeteer misplaces those in an iframe inside a closed shadow root
const click = (sel) => panel.$eval(sel, (n) => n.click());

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

  await openForm(browser, page, 'action-base.action_res_users/2'); // Administrator's user form
});

after(() => browser?.close());

test('the button appears on the Odoo page and opens the panel', async () => {
  panel = await openPanel(page);
  await Promise.all(browser.targets().map(watch));
  await panel.waitForFunction(() => document.querySelector('#status')?.textContent.includes('res.users'), { timeout: 15_000 });
});

test('every tab opens its cards without an error', async () => {
  const tabs = await panel.$$eval('.tabs button', (bs) => bs.map((b) => b.dataset.tab));
  assert.ok(tabs.length >= 9, `tabs: ${tabs}`);
  for (const tab of tabs) {
    await click(`.tabs [data-tab="${tab}"]`);
    assert.equal(await panel.$eval(`#${tab}`, (s) => s.classList.contains('active')), true, `${tab} tab shown`);
    await panel.$$eval(`#${tab} details.card`, (cards) => cards.forEach((c) => { c.open = true; }));
    await panel.waitForFunction((t) => [...document.querySelectorAll(`#${t} .card-body`)] // opened cards fill in async
      .every((b) => b.childElementCount && !b.querySelector(':scope > .loading')), { timeout: 30_000 }, tab);
    const failed = await panel.$$eval(`#${tab} .card-body > .error, #${tab} > .empty`, (ns) => ns.filter((n) => !n.hidden).map((n) => n.textContent));
    assert.deepEqual(failed, [], `${tab} tab`);
  }
});

test('RPC tab: the calls the webclient made to load the form are listed', async () => {
  await click('.tabs [data-tab="rpc"]');
  const methods = await panel.$$eval('#rpc .list .name', (ns) => ns.map((n) => n.textContent));
  assert.ok(methods.includes('web_read'), `methods: ${methods}`);
});

test('Code tab: a search runs as the logged-in user, writes are blocked by default', async () => {
  const run = async (code) => {
    await click('.tabs [data-tab="code"]');
    await panel.$eval('#code details.card', (c) => { c.open = true; });
    await panel.waitForSelector('#code textarea.code');
    await panel.$eval('#code textarea.code', (t, v) => { t.value = v; }, code);
    await click('#code .console .btn');
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
