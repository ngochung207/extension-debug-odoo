// Code tab: the editor. A transparent <textarea> (so caret, selection, IME and undo stay the browser's) over a <pre> that
// paints the same text in colours, with line numbers beside it. Typing is smarter than a textarea's (logic.js smartEdit).
import { tokenize, smartEdit } from './logic.js';
import { el } from '../../shared/ui.js';

/** Replaces text[from, to) of `ta` by `text` the way typing does (one undo step, an `input` event); the caret goes after it. */
export function replaceRange(ta, from, to, text) {
  ta.focus();
  ta.setSelectionRange(from, to);
  if (document.execCommand(text ? 'insertText' : 'delete', false, text)) return; // keeps Ctrl+Z working
  ta.setRangeText(text, from, to, 'end'); // execCommand refused (no focus in this frame)
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/** keydown handler part: a character, Backspace or Enter typed smartly. true: it was handled, the browser must not. */
export function smartKey(ta, ev) {
  if (ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
  const edit = smartEdit(ta.value, ta.selectionStart, ta.selectionEnd, ev.key);
  if (!edit) return false;
  ev.preventDefault();
  if (edit.from !== edit.to || edit.text) replaceRange(ta, edit.from, edit.to, edit.text);
  ta.setSelectionRange(...edit.select);
  return true;
}

/** Where the caret is, in px from the top left of the editor body. Measured on the painted copy of the text (a Range
 * at the same line and column), so wrapped lines are right too. */
export function caretPoint(ta) {
  const body = ta.parentElement;
  const before = ta.value.slice(0, ta.selectionStart);
  const line = body.querySelector('pre.hl').children[before.split('\n').length - 1];
  let col = before.length - before.lastIndexOf('\n') - 1;
  let box = line.getBoundingClientRect(); // an empty line has no text to put a Range in
  for (const walk = document.createTreeWalker(line, NodeFilter.SHOW_TEXT); walk.nextNode();) {
    const node = walk.currentNode;
    if (col > node.length) { col -= node.length; continue; }
    const r = document.createRange();
    r.setStart(node, col);
    box = r.getBoundingClientRect();
    break;
  }
  const at = body.getBoundingClientRect();
  return { left: box.left - at.left, bottom: box.bottom - at.top };
}

/** → { root, ta, body }: `root` goes in the page; `body` (position: relative) also holds what floats over the text.
 * Long lines wrap (no sideways scrolling in a narrow panel): the painted copy has one block per line, numbered by CSS,
 * so a wrapped line keeps one number. */
export function codeEditor(value, label) {
  const ta = el('textarea', { class: 'code', rows: 10, spellcheck: false, value, 'aria-label': label });
  ta.setAttribute('autocapitalize', 'off');
  for (const a of ['autocomplete', 'autocorrect']) ta.setAttribute(a, 'off');
  ta.setAttribute('writingsuggestions', 'false'); // Chrome's own inline suggestions and marks: not for code
  const paint = el('pre', { class: 'hl', 'aria-hidden': 'true' });
  const body = el('div', { class: 'editor-body' }, paint, ta);
  const refresh = () => {
    const lines = [el('div')];
    for (const [type, text] of tokenize(ta.value)) {
      text.split('\n').forEach((part, i) => {
        if (i) lines.push(el('div'));
        if (part) lines.at(-1).append(type ? el('span', { class: `tok-${type}` }, part) : part);
      });
    }
    paint.replaceChildren(...lines);
    body.style.setProperty('--digits', Math.max(2, String(lines.length).length)); // the gutter grows with the line count
    paint.scrollTop = ta.scrollTop;
  };
  ta.addEventListener('input', refresh);
  ta.addEventListener('scroll', () => { paint.scrollTop = ta.scrollTop; }); // the painted copy follows the textarea's scrolling
  refresh();
  return { root: el('div', { class: 'editor' }, body), ta, body };
}
