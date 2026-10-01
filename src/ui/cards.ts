// A tab's cards and filtered lists. Markup in components.tpl.html, styles in panel.css (.card, .card-body, .toolbar).
import { _t } from '../i18n/i18n.ts';
import { errBox, loading, tpl } from './components.ts';

/** What a card shows: built when it opens (may be async); a failure shows its error in that card only. */
export type CardBuilder = () => Node | null | undefined | Promise<Node | null | undefined>;

// Cards start closed; the ones opened stay open across re-renders and reloads (localStorage of the panel, every
// instance): a per-viewer convenience.
const OPEN_CARDS = 'odoo-debug-open-cards';
const openCards = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_CARDS) || '[]') as string[]); } catch { return new Set(); } };
function rememberCard(id: string, open: boolean) {
  const ids = openCards();
  if (open) ids.add(id); else ids.delete(id);
  try { localStorage.setItem(OPEN_CARDS, JSON.stringify([...ids])); } catch { /* storage off: every card starts closed */ }
}

/** `body` shows Loading…, then what `fn` builds, or its error. */
function fill(body: HTMLElement, fn: CardBuilder) {
  body.replaceChildren(loading());
  Promise.resolve().then(fn).then((n) => body.replaceChildren(...(n ? [n] : [])), (e: unknown) => body.replaceChildren(errBox(e)));
}

/** A collapsible card of the tab `parent`, remembered as `<tab>:<key>` (key: stable; the title is translated). */
export function block(parent: HTMLElement, key: string, title: string, fn: CardBuilder): HTMLDetailsElement {
  const id = `${parent.id}:${key}`;
  const { card, title: h, body } = tpl('block', { card: HTMLDetailsElement, title: HTMLHeadingElement, body: HTMLDivElement }).refs;
  card.dataset.key = key; // the full-screen layout places some side by side (panel.css)
  h.textContent = title;
  let loaded = false;
  const load = () => { if (!loaded) { loaded = true; fill(body, fn); } };
  card.addEventListener('toggle', () => { rememberCard(id, card.open); if (card.open) load(); });
  card.open = openCards().has(id);
  if (card.open) load();
  parent.append(card);
  return card;
}

/** A tab's only card: no title to open it by, its body built right away. */
export function card(parent: HTMLElement, fn: CardBuilder): HTMLElement {
  const { root, refs } = tpl('card', { body: HTMLDivElement });
  fill(refs.body, fn);
  parent.append(root);
  return root;
}

/** A search box hiding the `items` (with a data-q text) not matching it, and those `keep` rejects; `onCount(visible)`
 * after each change. `refresh()` re-applies it (when `keep` changed). */
export function filterBox(items: readonly HTMLElement[], placeholder: string, onCount?: (visible: number) => void,
  keep: (item: HTMLElement) => boolean = () => true): { input: HTMLInputElement; refresh: () => void } {
  const { input } = tpl('filter', { input: HTMLInputElement }).refs;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  const refresh = () => {
    const q = input.value.toLowerCase();
    for (const li of items) li.hidden = !(li.dataset.q || '').includes(q) || !keep(li);
    onCount?.(items.filter((li) => !li.hidden).length);
  };
  input.addEventListener('input', refresh);
  return { input, refresh };
}

export const countText = (visible: number, total: number, all: string, some: string) =>
  visible === total ? _t(all, total) : _t(some, visible, total);
