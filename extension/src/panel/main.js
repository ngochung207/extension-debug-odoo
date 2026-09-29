// Panel shell (in an iframe inside the Odoo page): header (status, debug switch), tab switching, binding to its tab.
// Settings live in the toolbar popup (src/popup/).
// Each tab's content lives in src/features/<tab>/.
import { lang, loadLang, translateDom, _t } from '../shared/i18n.js';
import { $, tabId, setTab, exec, el, pill, empty, clearCache, copyable } from '../shared/ui.js';
import { pageState, pageDebug } from '../shared/page.js';
import { renderRecord } from '../features/record/record.js';
import { renderView, setPicked } from '../features/view/view.js';
import { mountRpc, addRpc, reloadRpc } from '../features/rpc/rpc.js';
import { renderAccess } from '../features/access/access.js';
import { renderSecurity } from '../features/security/security.js';
import { renderPerf } from '../features/perf/perf.js';
import { renderTranslations } from '../features/translations/translations.js';
import { loadSettings } from '../shared/settings.js';

const settings = await loadSettings();
await loadLang(settings.lang); // before anything renders: every _t() below needs the catalog
document.documentElement.lang = lang;
translateDom();

let state = {};
let active = 'record';
const RENDER = { record: renderRecord, view: renderView, access: renderAccess, security: renderSecurity, perf: renderPerf, translations: renderTranslations };
const rendered = new Set(); // tabs are rendered lazily, once per refresh

function renderActive() {
  if (!(active in RENDER) || rendered.has(active)) return;
  rendered.add(active);
  const s = $('#' + active);
  s.replaceChildren();
  if (!state.odoo) return s.append(empty(state.error ? _t('Cannot read this tab: %s', state.error) : _t('The current tab is not an Odoo page.')));
  RENDER[active](s, state);
}

function showTab(name) {
  active = name;
  for (const b of document.querySelectorAll('.tabs button')) {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-selected', b.dataset.tab === name);
  }
  for (const s of document.querySelectorAll('.tab')) s.classList.toggle('active', s.id === name);
  renderActive();
}

let seq = 0; // a slow refresh must not overwrite a newer one (fast navigation, ⟳)
async function refresh() {
  const n = ++seq;
  $('#refresh').classList.add('spin');
  const next = (await exec(pageState)) || {};
  if (n !== seq) return;
  $('#refresh').classList.remove('spin');
  if (next.loadedAt !== state.loadedAt) clearCache(); // another page load: cached reads are stale
  state = next;
  const { model, resId, viewType } = state;
  $('#status').replaceChildren(...(!state.odoo
    ? [el('span', {}, _t('Not an Odoo page'))]
    : [model ? copyable(model, 'model') : el('span', { class: 'model' }, '—'), resId && pill(`#${resId}`, 'accent'), viewType && pill(viewType),
      state.action?.name && el('span', {}, state.action.name)].filter(Boolean))); // replaceChildren would print null/undefined
  for (const b of document.querySelectorAll('.seg button')) {
    b.classList.toggle('on', !!state.odoo && (b.dataset.debug === '0' ? !state.debug : state.debug.split(',').includes(b.dataset.debug)));
  }
  rendered.clear();
  renderActive();
}

// ---------- header ----------
mountRpc($('#rpc'), () => showTab('security'));
for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
for (const b of document.querySelectorAll('[data-debug]')) b.addEventListener('click', () => exec(pageDebug, b.dataset.debug));
$('#refresh').addEventListener('click', () => { clearCache(); refresh(); });

// ---------- bound to the tab it is embedded in (iframe from src/content/bubble.js; a page reload recreates it) ----------
let timer = null;
const scheduleRefresh = () => { clearTimeout(timer); timer = setTimeout(refresh, 500); };

chrome.tabs.onUpdated.addListener((id, change) => {
  if (id === tabId && (change.url || change.status === 'complete')) scheduleRefresh(); // Odoo's pushState navigation
});
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.tab?.id !== tabId) return;
  if (msg?.type === 'odoo-rpc') {
    addRpc(msg.raw);
  } else if (msg?.type === 'odoo-pick') {
    setPicked(msg.name); // '' = cancelled: the re-render just resets the picker button
    rendered.delete('view');
    showTab('view');
  }
});

// ---------- full screen: the frame belongs to content/bubble.js, which answers with the resulting state ----------
const fullBtn = $('#full');
const isFull = () => fullBtn.getAttribute('aria-pressed') === 'true';
const setFull = (on) => chrome.tabs.sendMessage(tabId, { type: 'odoo-full', on }).then((now) => {
  fullBtn.setAttribute('aria-pressed', !!now);
  fullBtn.textContent = now ? '⤡' : '⤢';
}, () => {});
fullBtn.addEventListener('click', () => setFull(!isFull()));
addEventListener('keydown', (e) => { // Esc leaves full screen, unless it is clearing a search box
  if (e.key === 'Escape' && isFull() && !e.target.value) setFull(false);
});

setTab(await chrome.tabs.getCurrent());
setFull(); // no argument: just read the state (full screen survives a reload)
await reloadRpc();
refresh();
