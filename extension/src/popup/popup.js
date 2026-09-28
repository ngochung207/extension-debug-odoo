// Toolbar popup (only enabled on Odoo pages, see background.js) and options page: language, theme, panel toggle.
import { LANGS, lang, loadLang, translateDom, _t, N_ } from '../shared/i18n.js';
import { THEMES, applyTheme, loadSettings } from '../shared/settings.js';
import { $, el } from '../shared/ui.js';

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
  $('#page').hidden = false;
}
