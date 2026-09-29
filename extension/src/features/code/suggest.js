// Code tab: the list of suggestions under the editor - models of the installed modules, their fields, the recordset API.
import { completionAt, rankSuggestions, METHODS, ENV_MEMBERS, COMMAND_MEMBERS, GLOBALS } from './logic.js';
import { call, cached, fieldsOf } from '../../shared/bridge.js';
import { caretPoint, replaceRange } from './editor.js';
import { el } from '../../shared/ui.js';
import { _t } from '../../shared/i18n.js';

const pairs = (list) => list.map(([label, detail]) => ({ label, detail }));
// ir.model only lists the models of installed modules; `modules` (In Apps) names the ones defining each.
const models = () => cached('models', async () => {
  const withModules = 'modules' in await fieldsOf('ir.model');
  const rows = await call('ir.model', 'search_read', [[]], { fields: ['model', 'name', ...(withModules ? ['modules'] : [])], order: 'model' });
  return rows.map((r) => ({ label: r.model, detail: [r.name, r.modules].filter(Boolean).join(' · ') }));
});

/** Fields of `model`, after following the relational fields of `path` (partner_id.country_id…). */
async function fieldItems(model, path) {
  for (const f of path) model = model && (await fieldsOf(model))[f]?.relation;
  if (!model) return [];
  return Object.entries(await fieldsOf(model)).map(([name, f]) =>
    ({ label: name, detail: `${f.type}${f.relation ? ` → ${f.relation}` : ''} · ${f.string}` }));
}

async function itemsFor(c) {
  if (c.kind === 'model') return models();
  if (c.kind === 'field') return fieldItems(c.model, c.path);
  if (c.kind === 'global') return pairs(GLOBALS);
  if (c.on === 'env' && !c.path.length) return pairs(ENV_MEMBERS);
  if (c.on === 'Command' && !c.path.length) return pairs(COMMAND_MEMBERS);
  return [...pairs(METHODS), ...await fieldItems(c.model, c.path)];
}

/** The list under the caret of `editor`, to put in the element the caret is measured in: update() after each edit, key(ev)
 * first in its keydown (true: the key was used). */
export function suggester(editor) {
  const box = el('ul', { class: 'suggest', role: 'listbox', 'aria-label': _t('Suggestions') });
  box.hidden = true;
  let shown = [], active = 0, ctx = null, seq = 0;
  let pending = null; // the label picked while an IME was composing the word: inserted once it is committed

  const close = () => { seq++; box.hidden = true; shown = []; };
  const mark = () => {
    [...box.children].forEach((li, i) => li.setAttribute('aria-selected', i === active));
    const li = box.children[active]; // kept in view by hand: scrollIntoView could scroll the Odoo page around the panel
    if (li.offsetTop < box.scrollTop) box.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = li.offsetTop + li.offsetHeight - box.clientHeight;
  };
  const accept = () => {
    const { from } = ctx;
    const { label } = shown[active];
    close();
    replaceRange(editor, from, editor.selectionStart, label); // its input event: saved, and the next suggestions (after a model: none)
  };
  const place = () => { // under the line of the caret, kept inside the editor's width
    const at = caretPoint(editor);
    const room = box.parentElement.clientWidth - box.offsetWidth;
    Object.assign(box.style, { left: `${Math.max(0, Math.min(at.left, room))}px`, top: `${at.bottom + 2}px` });
  };

  /** manual: Ctrl+Space, also for bare words (typed, `co` would offer Command while writing const). */
  async function update(manual = false) {
    const n = ++seq;
    const c = editor.selectionStart === editor.selectionEnd ? completionAt(editor.value, editor.selectionStart) : null;
    if (!c || (c.kind === 'global' && !manual)) return close();
    const items = rankSuggestions(await itemsFor(c).catch(() => []), c.prefix);
    if (n !== seq) return; // typed again meanwhile
    if (!items.length) return close();
    ctx = c;
    shown = items;
    active = 0;
    box.replaceChildren(...items.map((it, i) => el('li', {
      role: 'option',
      onmousedown: (e) => { e.preventDefault(); active = i; accept(); }, // mousedown: before the editor loses focus
    }, el('span', { class: 'name' }, it.label), it.detail && el('span', { class: 'muted' }, it.detail))));
    box.hidden = false;
    place();
    mark();
  }

  function key(ev) {
    // An IME (Vietnamese Telex: `s` is a tone key, so "search" is still being composed) commits its word after this key:
    // replacing it now would get the word typed again behind the pick (search_readsearch). Nothing is done while it
    // composes; a Tab / Enter picking a suggestion is done once the word is committed (compositionend).
    if (ev.isComposing || ev.keyCode === 229) {
      if (!box.hidden && ['Tab', 'Enter', 'NumpadEnter'].includes(ev.code)) { ev.preventDefault(); pending = shown[active].label; }
      return true;
    }
    pending = null;
    if (ev.key === ' ' && ev.ctrlKey) { ev.preventDefault(); update(true); return true; }
    if (box.hidden) return false;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      mark();
      return true;
    }
    if ((ev.key === 'Enter' && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey) || (ev.key === 'Tab' && !ev.shiftKey)) {
      ev.preventDefault();
      accept();
      return true;
    }
    if (ev.key === 'Escape') { ev.preventDefault(); close(); return true; }
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(ev.key)) close(); // the cursor moves away
    return false;
  }

  box.addEventListener('mousedown', (e) => e.preventDefault()); // the scrollbar of a long list must not take the focus (blur closes it)
  editor.addEventListener('scroll', () => box.hidden || place());
  editor.addEventListener('compositionend', () => {
    if (!pending) return;
    const label = pending;
    pending = null;
    setTimeout(() => { // after the committed text is in the value
      const c = completionAt(editor.value, editor.selectionStart);
      if (!c) return;
      close();
      replaceRange(editor, c.from, editor.selectionStart, label);
    });
  });
  editor.addEventListener('blur', close);
  editor.addEventListener('click', close);
  return { box, update, key };
}
