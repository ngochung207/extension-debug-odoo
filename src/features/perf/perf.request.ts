// Perf tab, the request opened beside the list (wide panel) or under its row: its name, when, its tools (flame graph,
// baseline, delete); its totals (queries, SQL time, total, Python ≈ the rest, CPU on 19.0); against the baseline when one
// is set (before / after a fix: counts, durations, the repeated statements gone, new, still there); then its SQL:
//   Lines of code   the lines of the addons sending the most queries (the frame under the ORM): where to fix
//   Repeated        the statements run more than once, the most first: N+1 suspects, and which lines run them
//   Slowest         the queries that took longest
// A query opens as run (its values in) with its stack.
import { _t } from '../../i18n/i18n.ts';
import type { OdooAdapter } from '../../odoo/adapter.ts';
import { call } from '../../odoo/rpc.ts';
import { pill } from '../../ui/components.ts';
import { matrix, type MxRow } from '../../ui/matrix.ts';
import { frag, note } from '../../ui/parts.ts';
import { deleteProfiles, speedscopeUrl } from './perf.data.ts';
import {
  appFrame, callerOf, compare, delta, FRAMEWORK_CALLER, frameText, ms, normalizeQuery, requestName, sqlSummary, type ProfileRow, type SqlEntry, type SqlSummary,
} from './perf.logic.ts';
import { sqlOf, type PerfState } from './perf.state.ts';
import { box, button, fold, link, queryDetail, queryText, text, total, tpl } from './perf.ui.ts';

/** Over this many queries a request is worth a look (the RPC tab and the list mark it). */
export const MANY_SQL = 50;

export interface RequestEnv {
  s: PerfState;
  a: OdooAdapter;
  origin: string;
  /** whether profiling is allowed on the database now (18.0's flame graph needs it) */
  allowed: boolean;
  rows: ReadonlyMap<number, ProfileRow>;
  rerender(): void;
}

/** The name of a request: method and model for a call_kw, else its route. */
export function nameNodes(name: string): Node[] {
  const n = requestName(name);
  return 'method' in n ? [text(n.method, 'name'), text(` ${n.model}`, 'muted')] : [text(n.route, 'name mono')];
}

export async function requestDetail(r: ProfileRow, e: RequestEnv): Promise<Node> {
  const entries = await sqlOf(e.s, r.id);
  const sum = sqlSummary(entries);
  const h = tpl('req-head', { box: HTMLDivElement, name: HTMLHeadingElement, meta: HTMLDivElement, actions: HTMLDivElement, totals: HTMLDivElement }).refs;
  h.name.append(...nameNodes(r.name));
  h.meta.textContent = [`#${r.id}`, r.create_date ? r.create_date.slice(11, 19) : '', r.session, r.name].filter(Boolean).join(' · ');

  const isBase = e.s.baseline === r.id;
  const flame = link(_t('Flame Graph ↗'), speedscopeUrl(e.origin, [r.id]),
    e.a.profiler.speedscopeNeedsEnabled && !e.allowed ? _t('Odoo 18 shows it only while profiling is allowed on the database') : _t('Odoo\'s speedscope view of this request'));
  h.actions.append(flame,
    button(isBase ? _t('Baseline ✓') : _t('Set as Baseline'), () => { e.s.baseline = isBase ? null : r.id; e.rerender(); }, 'chip',
      isBase ? _t('Stop comparing with this request') : _t('Compare the other requests with this one (before a fix)')));
  if (e.s.baseline != null && !isBase && e.a.profiler.speedscopeMany) {
    h.actions.append(link(_t('Side by Side ↗'), speedscopeUrl(e.origin, [e.s.baseline, r.id]), _t('Both flame graphs in speedscope')));
  }
  h.actions.append(button(_t('Delete'), () => {
    if (!confirm(_t('Delete this profile (#%s)?', r.id))) return;
    void deleteProfiles([r.id]).then(() => { if (e.s.selected === r.id) e.s.selected = null; if (isBase) e.s.baseline = null; e.rerender(); });
  }, 'chip', _t('Delete this ir.profile record')));

  const python = Math.max(0, r.duration - sum.time);
  h.totals.append(
    total(String(r.sql_count || sum.count), _t('queries'), _t('SQL queries of the request')),
    total(ms(sum.time), _t('in SQL'), _t('Time spent in the database')),
    total(ms(r.duration), _t('total'), _t('Real time of the request on the server')),
    total(`≈ ${ms(python)}`, _t('Python'), _t('The rest: Python, waiting, and the profiler itself')),
    ...(r.cpu_duration !== undefined ? [total(ms(r.cpu_duration), 'CPU', _t('CPU time of the server process (Odoo 19)'))] : []));

  const parts: Node[] = [h.box];
  if (e.s.baseline != null && !isBase) parts.push(await comparison(r, sum, e));
  if (!entries.length) parts.push(note(_t('No SQL recorded for this request (the SQL collector was off?).')));
  else {
    parts.push(fold('callers', _t('Lines of code sending queries'), String(sum.callers.length), () => callersTable(entries, sum), true));
    parts.push(fold('repeated', _t('Repeated queries: N+1 suspects'), String(sum.repeated.length), () => (sum.repeated.length
      ? matrix(_t('Statement'), [_t('Runs'), _t('Time')], [{ rows: sum.repeated.map((g): MxRow => ({
        label: [queryText(g.query)], sub: g.callers.map((x) => (x === FRAMEWORK_CALLER ? _t('Odoo itself') : x)).join(' · '), q: g.query,
        cells: [pill(`${g.count}×`, g.count >= 5 ? 'err' : 'med'), ms(g.time)], detail: () => queryDetail(g.first),
      })) }], -1)
      : note(_t('✓ No statement runs twice.'))), true));
    parts.push(fold('slowest', _t('Slowest queries'), String(sum.slowest.length), () => matrix(_t('Statement'), [_t('Time')], [{
      rows: sum.slowest.map((x): MxRow => ({ label: [queryText(normalizeQuery(x.query))], sub: frameText(appFrame(x.stack)), cells: [ms(x.time)], detail: () => queryDetail(x) })),
    }], -1)));
  }
  return box(...parts);
}

/** The lines of code sending queries: how many, how many statements, how long; a line opens its statements. */
function callersTable(entries: readonly SqlEntry[], sum: SqlSummary): Node {
  return frag(
    matrix(_t('Line of code'), [_t('Queries'), _t('Statements'), _t('Time')], [{ rows: sum.callers.map((c): MxRow => ({
      label: [c.caller === FRAMEWORK_CALLER ? text(_t('Odoo itself (no addon line in the stack)'), 'muted') : text(c.caller, 'mono')], q: c.caller,
      cells: [c.count >= 20 ? pill(String(c.count), c.count >= 100 ? 'err' : 'med') : String(c.count), String(c.queries), ms(c.time)],
      detail: () => {
        const mine = entries.filter((x) => callerOf(x.stack) === c.caller);
        const groups = new Map<string, { n: number; first: SqlEntry }>();
        for (const x of mine) { const k = normalizeQuery(x.query); const g = groups.get(k); if (g) g.n++; else groups.set(k, { n: 1, first: x }); }
        return matrix(_t('Statement'), [_t('Runs')], [{ rows: [...groups].sort((a, b) => b[1].n - a[1].n).map(([q, g]): MxRow => ({
          label: [queryText(q)], cells: [`${g.n}×`], detail: () => queryDetail(g.first),
        })) }], -1);
      },
    })) }], -1),
    note(_t('The line of an addon under the ORM that caused the queries. Many queries from one line, one statement repeated: a loop reading record by record (N+1).')));
}

/** This request against the baseline: counts and durations, then the repeated statements gone, new, still there. */
async function comparison(r: ProfileRow, sum: SqlSummary, e: RequestEnv): Promise<Node> {
  const baseId = e.s.baseline!;
  const baseRow = e.rows.get(baseId) ?? (await call<ProfileRow[]>('ir.profile', 'read', [[baseId], [...e.a.profiler.listFields]]))[0];
  if (!baseRow) { e.s.baseline = null; return note(_t('The baseline was deleted.')); }
  const c = compare({ row: baseRow, sum: sqlSummary(await sqlOf(e.s, baseId)) }, { row: r, sum });
  const better = (a: number, b: number) => (b < a ? 'ok' : b > a ? 'err' : '');
  const line = (label: string, [a, b]: [number, number], fmt: (x: number) => string): MxRow => ({
    label: [label], cells: [fmt(a), fmt(b), pill(delta(a, b, fmt), better(a, b))],
  });
  const groups: Node[] = [];
  if (c.gone.length) groups.push(text(_t('✓ Gone: %s', c.gone.map((g) => `${g.count}× ${g.query.slice(0, 60)}`).join(' · ')), 'ok-text'));
  if (c.added.length) groups.push(text(_t('✗ New: %s', c.added.map((g) => `${g.count}× ${g.query.slice(0, 60)}`).join(' · ')), 'err-text'));
  for (const k of c.kept) if (k.before !== k.after) groups.push(text(_t('%s× → %s×: %s', k.before, k.after, k.query.slice(0, 80)), 'muted'));
  const head = box(text(_t('Against the baseline #%s', baseId), 'strong'), ' ', ...nameNodes(baseRow.name));
  head.className = 'row';
  return box(head,
    matrix('', [_t('Baseline'), _t('This one'), _t('Change')], [{ rows: [
      line(_t('Queries'), c.sql, String), line(_t('Total'), c.duration, ms), line(_t('In SQL'), c.sqlTime, ms),
    ] }], -1),
    ...(groups.length ? groups : [note(_t('Repeated statements: the same as the baseline.'))]));
}
