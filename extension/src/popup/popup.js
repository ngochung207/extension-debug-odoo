// Toolbar popup (only enabled on Odoo pages, see background.js) and options page: language, theme, panel toggle.
import { LANGS, lang, loadLang, translateDom, _t, N_ } from '../shared/i18n.js';
import { THEMES, applyTheme, loadSettings } from '../shared/settings.js';
import { $, el } from '../shared/ui.js';
import { pageDebug } from '../shared/page.js';

const THEME_LABELS = { auto: N_('System'), light: N_('Light'), dark: N_('Dark') };

const saved = await loadSettings();
await loadLang(saved.lang);
document.documentElement.lang = lang;
translateDom();
$('#version').textContent = `v${chrome.runtime.getManifest().version}`;

/** Segmented control: one button per [value, label], `current` highlighted. */
function segmented(box, options, current, onPick) {
  box.replaceChildren(...options.map(([value, label]) => el('button', {
    class: value === current ? 'on' : '', role: 'radio', 'aria-checked': String(value === current),
    onclick: () => { segmented(box, options, value, onPick); onPick(value); },
  }, label)));
}
segmented($('#lang'), Object.entries(LANGS), lang, (v) => chrome.storage.local.set({ lang: v })); // loadSettings reloads the page
segmented($('#theme'), THEMES.map((t) => [t, _t(THEME_LABELS[t])]), saved.theme || 'auto',
  (v) => { applyTheme(v); chrome.storage.local.set({ theme: v }); });

// "This page" only makes sense in the toolbar popup, not on the options page.
if (chrome.extension.getViews({ type: 'popup' }).includes(window)) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('#host').textContent = tab?.url ? new URL(tab.url).host : '';
  $('#toggle').addEventListener('click', () => {
    chrome.tabs.sendMessage(tab.id, { type: 'odoo-toggle' }).catch(() => {}); // content script missing: page opened before install
    window.close();
  });
  // Odoo's debug mode of this tab: reloads it with ?debug=0 / 1 / assets (Odoo keeps it in the session)
  const [{ result: debug = '' } = {}] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => window.odoo?.debug || '' })
    .catch(() => []); // not scriptable (chrome:// …): no current mode shown
  const current = debug.split(',').includes('assets') ? 'assets' : debug ? '1' : '0';
  segmented($('#debug'), [['0', 'off'], ['1', 'debug'], ['assets', 'assets']], current, async (mode) => {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: pageDebug, args: [mode] }).catch(() => {});
    window.close();
  });
  $('#page').hidden = false;
}
