// Tables of the panel (Security, Translations…): a first column naming each row, then narrow columns of symbols —
// ✓ allowed / matches, ✗ refused / no match, · does not apply, ? unknown, +✓ brought by something being tried — or,
// `wide`, columns of text. Rows group under section titles (folding when asked), open a detail below them, and filter.
// Every symbol explains itself on hover (tooltip.ts). Markup: components.tpl.html (matrix, mx-*, sym).
import { N_, _t } from '../i18n/i18n.ts';
import { errBox, loading, tpl } from './components.ts';
import { tip } from './tooltip.ts';

/** true / false / null: could not be told. */
export type Tri = boolean | null;

/** A cell: a result (✓ ✗ · ?) with a second user's beside it, `plus` when a tried group brings it; or text, or a node. */
export type Cell = { v: Tri | 'na'; b?: Tri | 'na'; plus?: boolean; /** what it means here, on hover */ title?: string; titleB?: string } | string | Node;
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

const SYMBOL_TIP = { yes: N_('Allowed / matches'), no: N_('Refused / doesn\'t match'), na: N_('Does not apply'), unk: N_('Unknown: could not be checked') } as const;

/** ✓ ✗ · ? (+✓: brought by a tried group), its meaning on hover (`text`: a more precise one). */
export function symbol(v: Tri | 'na', plus = false, text = ''): HTMLSpanElement {
  const { sym: s } = tpl('sym', { sym: HTMLSpanElement }).refs;
  s.className = `sym ${CLASS(v)}${plus ? ' plus' : ''}`;
  s.textContent = `${plus && v === true ? '+' : ''}${SYMBOL(v)}`;
  return tip(s, text || (plus && v === true ? _t('Added by the groups being tried') : _t(SYMBOL_TIP[CLASS(v)])));
}

function fillCell(td: HTMLTableCellElement, c: Cell) {
  if (typeof c === 'string') { td.textContent = c; return; }
  if (c instanceof Node) { td.append(c); td.classList.add('act'); return; }
  td.append(symbol(c.v, c.plus, c.title));
  if (c.b !== undefined) { td.append(symbol(c.b, false, c.titleB)); td.classList.add('two'); if (c.b !== c.v) td.classList.add('diff'); }
}

/**
 * A table: `heads` name the columns after the first; `sections` group the rows under a title line (folding by it when
 * asked). `focus`: a column to underline (the operation an error named). A row with a detail opens it below on click.
 */
export function matrix(first: string, heads: readonly string[], sections: readonly MxSection[], focus = -1, wide = false): HTMLTableElement {
  const t = tpl('matrix', { head: HTMLTableRowElement, first: HTMLTableCellElement }).refs;
  const table = t.head.closest('table')!;
  if (wide) table.classList.add('wide'); // text in the columns: they share the width, left aligned
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
