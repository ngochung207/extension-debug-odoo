// Gettext-style i18n. msgids are the English source strings; translations live in i18n/<lang>.po
// (read at runtime, no build step). Regenerate the .pot / merge the .po files with `npm run i18n`.
export const LANGS = { en: 'English', vi: 'Tiếng Việt' };
let catalog = new Map();
export let lang = 'en';

/** Translates `msgid` and fills its %s placeholders in order. Untranslated → the English msgid. */
export function _t(msgid, ...args) {
  let i = 0;
  return (catalog.get(msgid) || msgid).replace(/%s/g, () => String(args[i++] ?? ''));
}
/** Marks a string for extraction only; translate it later with _t(value). For code that can't call _t (page functions). */
export const N_ = (s) => s;

/** .po text → Map msgid → msgstr. Skips the header, untranslated and fuzzy entries. */
export function parsePo(text) {
  const out = new Map();
  for (const entry of text.replace(/\r/g, '').split(/\n{2,}/)) {
    if (/^#,.*\bfuzzy\b/m.test(entry)) continue;
    const e = { msgid: '', msgstr: '' };
    let cur = null;
    for (const line of entry.split('\n')) {
      const m = line.match(/^(msgid|msgstr|msgctxt|msgid_plural|msgstr\[\d+\])\s+(".*")$/);
      if (m) { cur = m[1]; e[cur] = JSON.parse(m[2]); } // PO escapes (\" \\ \n \t) are valid JSON escapes
      else if (cur && /^".*"$/.test(line)) e[cur] += JSON.parse(line);
    }
    if (e.msgid && e.msgstr) out.set(e.msgid, e.msgstr);
  }
  return out;
}

/** Loads `code` (the one chosen in Settings), else Chrome's UI language, else English. */
export async function loadLang(code) {
  const ui = chrome.i18n.getUILanguage().toLowerCase().split('-')[0];
  lang = code in LANGS ? code : ui in LANGS ? ui : 'en';
  try {
    const r = await fetch(chrome.runtime.getURL(`i18n/${lang}.po`));
    catalog = r.ok ? parsePo(await r.text()) : new Map();
  } catch { catalog = new Map(); }
}

/**
 * Static markup: data-i18n="text,title,placeholder,aria-label" translates the element's first text node
 * and/or those attributes, using their current (English) value as msgid.
 */
export function translateDom(root = document) {
  for (const n of root.querySelectorAll('[data-i18n]')) {
    for (const what of n.dataset.i18n.split(',')) {
      if (what === 'text') {
        const t = [...n.childNodes].find((c) => c.nodeType === Node.TEXT_NODE && c.textContent.trim());
        if (t) t.textContent = t.textContent.replace(t.textContent.trim(), _t(t.textContent.trim()));
      } else if (n.hasAttribute(what)) n.setAttribute(what, _t(n.getAttribute(what)));
    }
  }
}
