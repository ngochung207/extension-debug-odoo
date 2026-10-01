// Security tab: the pieces its views share. Markup: security.tpl.html. Every table is a matrix(): one symbol language
// everywhere: ✓ allowed / matches, ✗ refused / no match, · does not apply, ? unknown; +✓ what a tried group adds.
import { translateDom, _t } from '../../i18n/i18n.ts';
import type { OdooAdapter } from '../../odoo/adapter.ts';
import { MODES, type Mode } from '../../odoo/models.ts';
import { errBox, loading, pill, type PillKind } from '../../ui/components.ts';
import { templates } from '../../ui/template.ts';
import { keyGroups, searchUsers } from './security.data.ts';
import type { Finding, Level, Tri } from './security.logic.ts';
import html from './security.tpl.html';

export const tpl = templates(html, translateDom);

const MODE_LABEL: Record<Mode, string> = { read: 'Read', write: 'Write', create: 'Create', unlink: 'Delete' };
export const modeLabel = (m: Mode) => _t(MODE_LABEL[m]);
export const modeHeads = () => MODES.map(modeLabel);

const LEVEL: Record<Level, string> = { high: 'HIGH', med: 'MEDIUM', low: 'LOW', info: 'INFO' };

export function findings(list: readonly Finding[]): HTMLElement {
  if (!list.length) return tpl('okline').root;
  const { list: ul } = tpl('findings', { list: HTMLUListElement }).refs;
  for (const f of list) {
    const r = tpl('finding', { item: HTMLLIElement, pill: HTMLSpanElement, text: HTMLSpanElement }).refs;
    r.item.classList.add(f.level);
    r.pill.replaceWith(pill(_t(LEVEL[f.level]), f.level as PillKind));
    r.text.textContent = f.msg;
    ul.append(r.item);
  }
  return ul;
}

export function button(text: string, onClick: () => void, kind: 'btn' | 'chip' = 'btn', title = ''): HTMLButtonElement {
  const { button: b } = tpl(kind === 'btn' ? 'button' : 'chip', { button: HTMLButtonElement }).refs;
  b.textContent = text;
  if (title) b.title = title;
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

export function box(...nodes: (Node | string | null | undefined | false)[]): HTMLDivElement {
  const { box: b } = tpl('box', { box: HTMLDivElement }).refs;
  b.append(...nodes.filter((n): n is Node | string => !!n));
  return b;
}

export const title = (text: string) => { const { title: t } = tpl('sub-title', { title: HTMLHeadingElement }).refs; t.textContent = text; return t; };

export function plainList(items: readonly string[]): HTMLUListElement {
  const { list } = tpl('plain-list', { list: HTMLUListElement }).refs;
  for (const text of items) { const { item } = tpl('plain-item', { item: HTMLLIElement }).refs; item.textContent = text; list.append(item); }
  return list;
}

/** Shows an error in `out` (a refused write: Access Rights needed). */
export const errBoxTo = (out: HTMLElement, e: unknown) => out.replaceChildren(errBox(e));

/** A membership mark: ● has it, ◐ through another group, ○ hasn't, + being tried. */
export function mark(kind: 'has' | 'implied' | 'no' | 'tried', title = ''): HTMLSpanElement {
  const { mark: m } = tpl('mark', { mark: HTMLSpanElement }).refs;
  m.textContent = { has: '●', implied: '◐', no: '○', tried: '+' }[kind];
  m.classList.add(kind);
  if (title) m.title = title;
  return m;
}

// ---------- the permission table ----------

/** A cell: a result (✓ ✗ · ?) with a second user's beside it, `plus` when a tried group brings it; or text, or a node. */
export type Cell = { v: Tri | 'na'; b?: Tri | 'na'; plus?: boolean; title?: string } | string | Node;
export interface MxRow {
  label: (Node | string)[];
  sub?: string;
  cells: Cell[];
  /** off: doesn't apply to the user (muted); sum: the line concluding a section; result: the answer */
  kind?: 'off' | 'sum' | 'result';
  /** built under the row on its first click */
  detail?: () => Node | Promise<Node>;
  /** the text a filter finds it by */
  q?: string;
  /** what a filter can keep it by (filterMatrix's `keep`) */
  tags?: string[];
}
export interface MxSection { title?: string; note?: string; rows: MxRow[]; /** set: the section folds by its title */ folded?: boolean }

const SYMBOL = (v: Tri | 'na') => (v === true ? '✓' : v === false ? '✗' : v === 'na' ? '·' : '?');
const CLASS = (v: Tri | 'na') => (v === true ? 'yes' : v === false ? 'no' : v === 'na' ? 'na' : 'unk');

function symbol(v: Tri | 'na', plus = false): HTMLSpanElement {
  const { mark: s } = tpl('mark', { mark: HTMLSpanElement }).refs;
  s.className = `sym ${CLASS(v)}${plus ? ' plus' : ''}`;
  s.textContent = `${plus && v === true ? '+' : ''}${SYMBOL(v)}`;
  return s;
}

function fillCell(td: HTMLTableCellElement, c: Cell) {
  if (typeof c === 'string') { td.textContent = c; return; }
  if (c instanceof Node) { td.append(c); td.classList.add('act'); return; }
  td.append(symbol(c.v, c.plus));
  if (c.b !== undefined) { td.append(symbol(c.b)); td.classList.add('two'); if (c.b !== c.v) td.classList.add('diff'); }
  if (c.title) td.title = c.title;
}

/**
 * A table: `heads` name the columns after the first; `sections` group the rows under a title line (folding by it when
 * asked). `focus`: a column to underline (the operation an error named). A row with a detail opens it below on click.
 */
export function matrix(first: string, heads: readonly string[], sections: readonly MxSection[], focus = -1): HTMLTableElement {
  const t = tpl('matrix', { head: HTMLTableRowElement, first: HTMLTableCellElement }).refs;
  const table = t.head.closest('table')!;
  t.first.textContent = first;
  heads.forEach((h, i) => {
    const { cell } = tpl('mx-th', { cell: HTMLTableCellElement }).refs;
    cell.textContent = h;
    if (i === focus) cell.classList.add('focus');
    t.head.append(cell);
  });
  const span = heads.length + 1;
  for (const s of sections) {
    const sec = tpl('mx-section', { body: HTMLTableSectionElement, row: HTMLTableRowElement, title: HTMLTableCellElement, text: HTMLSpanElement, note: HTMLSpanElement }).refs;
    if (s.title) {
      sec.title.colSpan = span;
      sec.text.textContent = s.title;
      sec.note.textContent = s.note ?? '';
      if (s.folded !== undefined) {
        sec.body.classList.add('foldable');
        sec.body.classList.toggle('folded', s.folded);
        sec.row.addEventListener('click', () => sec.body.classList.toggle('folded'));
      }
    } else sec.row.remove();
    for (const r of s.rows) sec.body.append(...row(r, span, focus));
    table.append(sec.body);
  }
  return table;
}

function row(r: MxRow, span: number, focus: number): HTMLTableRowElement[] {
  const x = tpl('mx-row', { row: HTMLTableRowElement, main: HTMLDivElement, sub: HTMLDivElement }).refs;
  x.main.append(...r.label);
  if (r.sub) x.sub.textContent = r.sub;
  else x.sub.remove();
  if (r.kind) x.row.classList.add(r.kind);
  if (r.q) x.row.dataset.q = r.q.toLowerCase();
  if (r.tags?.length) x.row.dataset.tags = r.tags.join(' ');
  r.cells.forEach((c, i) => {
    const { cell } = tpl('mx-cell', { cell: HTMLTableCellElement }).refs;
    fillCell(cell, c);
    if (i === focus) cell.classList.add('focus');
    x.row.append(cell);
  });
  if (!r.detail) return [x.row];
  const build = r.detail;
  x.row.classList.add('opens');
  x.row.tabIndex = 0;
  let d: HTMLTableRowElement | null = null;
  const toggle = () => {
    if (!d) {
      const dt = tpl('mx-detail', { row: HTMLTableRowElement, cell: HTMLTableCellElement }).refs;
      dt.cell.colSpan = span;
      dt.cell.append(loading());
      Promise.resolve().then(build).then((n) => dt.cell.replaceChildren(n), (e: unknown) => dt.cell.replaceChildren(errBox(e)));
      d = dt.row;
      x.row.after(d);
    } else d.hidden = !d.hidden;
    x.row.classList.toggle('open', !d.hidden);
  };
  x.row.addEventListener('click', (e) => { if (!(e.target as Element).closest('button, a, input')) toggle(); });
  x.row.addEventListener('keydown', (e) => { if (e.target === x.row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } });
  return [x.row];
}

/** Hides the rows (with a data-q) not matching `q` or `keep`, and the sections left empty; → the rows shown. */
export function filterMatrix(table: HTMLTableElement, q: string, keep: (row: HTMLTableRowElement) => boolean = () => true): number {
  const needle = q.trim().toLowerCase();
  let shown = 0;
  for (const body of table.tBodies) {
    const rows = [...body.querySelectorAll<HTMLTableRowElement>('tr[data-q]')];
    if (!rows.length) continue;
    let any = false;
    for (const r of rows) {
      const ok = r.dataset.q!.includes(needle) && keep(r);
      r.hidden = !ok;
      const next = r.nextElementSibling;
      if (!ok && next instanceof HTMLTableRowElement && next.classList.contains('mx-detail')) next.hidden = true;
      if (ok) { any = true; shown++; }
    }
    body.hidden = !any;
    if (needle && any) body.classList.remove('folded');
  }
  return shown;
}

/** A rule opened: its domain as written, as evaluated for the user, why it couldn't be checked. */
export function domainDetail(domain: string, ev: { domain: unknown } | { error: string } | undefined, why?: string): Node {
  const d = tpl('rule-detail', { box: HTMLDivElement, domain: HTMLElement, evRow: HTMLDivElement, evaluated: HTMLElement, note: HTMLDivElement }).refs;
  d.domain.textContent = domain;
  if (ev && 'domain' in ev) d.evaluated.textContent = JSON.stringify(ev.domain);
  else d.evRow.remove();
  const text = why ? _t(why) : ev && 'error' in ev ? _t('cannot evaluate: %s', _t(ev.error)) : '';
  if (text) d.note.textContent = text;
  else d.note.remove();
  return d.box;
}

// ---------- users ----------

/**
 * A user search box: typing searches res.users on the server (name or login, 20 matches, archived too when ticked);
 * ↑ ↓ Enter or a click picks one. 250 ms between searches; an older answer never replaces a newer one.
 */
export function userSearch(a: OdooAdapter, archived: { value: boolean; set(v: boolean): void }, placeholder: string, onPick: (uid: number) => void): HTMLElement {
  const r = tpl('user-search', { root: HTMLSpanElement, input: HTMLInputElement, list: HTMLUListElement, archived: HTMLInputElement }).refs;
  r.input.placeholder = placeholder;
  r.input.setAttribute('aria-label', placeholder);
  r.archived.checked = archived.value;
  let shown: { id: number }[] = [];
  let sel = 0;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const markSel = () => [...r.list.children].forEach((li, i) => {
    li.setAttribute('aria-selected', String(i === sel));
    if (i === sel) li.scrollIntoView({ block: 'nearest' });
  });
  const search = async () => {
    const q = r.input.value.trim();
    const n = ++seq;
    if (!q) { shown = []; r.list.hidden = true; return; }
    const [users, keys] = await Promise.all([searchUsers(q, archived.value, a).catch(() => []), keyGroups()]);
    if (n !== seq) return;
    const publicId = keys.get('base.group_public');
    shown = users;
    sel = 0;
    r.list.replaceChildren(...users.map((u) => {
      const it = tpl('suggest-item', { item: HTMLLIElement, name: HTMLSpanElement, meta: HTMLSpanElement }).refs;
      it.name.textContent = u.name;
      const groups = (u[a.users.allGroupsField] as number[] | undefined) ?? [];
      it.meta.textContent = [u.login, u.share && (publicId != null && groups.includes(publicId) ? _t('public') : _t('portal')), !u.active && _t('archived')].filter(Boolean).join(' · ');
      it.item.addEventListener('mousedown', (e) => { e.preventDefault(); onPick(u.id); }); // before the blur hides the list
      return it.item;
    }));
    r.list.hidden = !users.length;
    markSel();
  };
  r.input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  r.input.addEventListener('focus', () => { if (shown.length) r.list.hidden = false; });
  r.input.addEventListener('blur', () => { r.list.hidden = true; });
  r.input.addEventListener('keydown', (e) => {
    if (r.list.hidden || !shown.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; markSel(); }
    else if (e.key === 'Enter') { const hit = shown[sel]; if (hit) onPick(hit.id); }
    else if (e.key === 'Escape') { e.stopPropagation(); r.list.hidden = true; } // not the panel's Esc (leave full screen)
  });
  r.archived.addEventListener('change', () => { archived.set(r.archived.checked); void search(); });
  return r.root;
}

/** Logs in as `login` in an incognito window (its own cookies: your session here stays), on Odoo's login page with
 * their login filled in, back to `url` after; the password (2FA too) is typed there. Through /web/session/logout: an
 * incognito window still logged in as someone else would skip the login page. */
export function loginAs(name: string, login: string, db: string, url: string, out: HTMLElement): HTMLButtonElement {
  const { origin, pathname, search, hash } = new URL(url);
  const target = `/web/login?${new URLSearchParams({ db, login, redirect: pathname + search + hash })}`;
  const b = button(name, () => {
    chrome.windows.create({ incognito: true, url: `${origin}/web/session/logout?redirect=${encodeURIComponent(target)}` })
      .catch((e: unknown) => out.replaceChildren(errBox(e)));
  }, 'btn', _t('Log in as %s in an incognito window', name));
  b.className = 'user-name';
  return b;
}
