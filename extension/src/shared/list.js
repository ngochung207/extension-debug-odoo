// A ;-separated list typed in one input (the Apps and Translations tabs): pure helpers, tested by tests/list.test.mjs.

/** "sale; stock ,web" → ['sale', 'stock', 'web'] (';' as asked, ',' and spaces tolerated, duplicates dropped). */
export const splitList = (text) => [...new Set(String(text ?? '').split(/[;,\s]+/).filter(Boolean))];

/** The word being typed at the end of a ;-list ("sale; acc" → "acc", "sale; " → ""): it searches the installed modules. */
export const lastToken = (text) => String(text ?? '').split(/[;,\s]+/).at(-1);

/** The last word is a search (not a module name in `known`) while being typed: kept aside, never taken as a pick. */
function typing(text, known) {
  const tok = lastToken(text);
  return tok && !known.has(tok) ? tok : '';
}

/** `text` with `name` ticked: the word being typed (a search) replaced by it; "a; b; " so the next one can be typed. */
export function pickInList(text, name, known) {
  const tok = typing(text, known);
  const names = splitList(text).filter((n) => n !== name && !(tok && n === tok));
  return [...names, name].map((n) => `${n}; `).join('');
}

/** `text` with `name` unticked; the word being typed stays at the end. */
export function unpickInList(text, name, known) {
  const tok = typing(text, known);
  const names = splitList(text).filter((n) => n !== name && !(tok && n === tok));
  return names.map((n) => `${n}; `).join('') + tok;
}
