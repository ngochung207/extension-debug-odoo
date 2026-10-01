// Security tab, view "By model": what the user can do across the database, one row per model (the ACLs of every
// module merged), models under the module that defines them. A last column counts the record rules restricting which
// records. Groups being tried show what they add (+✓); a user compared shows beside (✓|✗), "only differences" keeps the
// rows where they differ. A row opens the ACLs and rules behind it. Needs Access Rights (base.group_erp_manager).
import { _t } from '../../i18n/i18n.ts';
import { MODES } from '../../odoo/models.ts';
import { fill, filterBox } from '../../ui/cards.ts';
import { note } from '../../ui/parts.ts';
import { readAllRules, readModels, type Simulated } from './security.data.ts';
import { firstModule, modelRights, type ModelRights } from './security.logic.ts';
import type { SecurityCtx } from './security.state.ts';
import { box, button, filterMatrix, matrix, modeHeads, modeLabel, plainList, tpl, type MxRow, type MxSection } from './security.ui.ts';

export function modelsView(body: HTMLElement, c: SecurityCtx) {
  fill(body, async () => {
    const [sim, other, acls, rules] = await Promise.all([c.sim, c.other, c.allAcls(), readAllRules()]);
    if (!acls || !rules) return note(_t('The rights across models need Access Rights (base.group_erp_manager).'));
    const mine = modelRights(acls, sim.groupIds);
    const real = sim.tried.size ? modelRights(acls, sim.real) : mine;
    const theirs = other ? modelRights(acls, other.groupIds) : null;
    const ids = [...new Set([...mine.keys(), ...(theirs?.keys() ?? [])])];
    const models = new Map(((await readModels(ids)) ?? []).map((m) => [m.id, m]));

    const restricting = (u: Simulated, modelId: number) => rules.filter((r) => r.model_id && r.model_id[0] === modelId && (r.global || r.groups.some((g) => u.groupIds.has(g))));
    const byModule = new Map<string, MxRow[]>();
    for (const id of ids) {
      const m = models.get(id);
      const a = mine.get(id), b = theirs?.get(id), was = real.get(id);
      const name = m?.name ?? a?.model[1] ?? b?.model[1] ?? `#${id}`;
      const tech = m?.model ?? '';
      const rs = restricting(sim, id);
      const changed = MODES.some((x) => a?.modes.has(x) && !was?.modes.has(x));
      const differs = !!theirs && MODES.some((x) => !!a?.modes.has(x) !== !!b?.modes.has(x));
      const row: MxRow = {
        label: [name],
        sub: tech,
        q: `${name} ${tech} ${firstModule(m?.modules)}`,
        tags: [changed && 'added', differs && 'differs'].filter((t): t is string => !!t),
        cells: [
          ...MODES.map((x) => ({
            v: a?.modes.has(x) ? true : 'na' as const,
            ...(theirs ? { b: b?.modes.has(x) ? true : 'na' as const } : {}),
            plus: !!a?.modes.has(x) && !was?.modes.has(x),
          })),
          rs.length ? String(rs.length) : '',
        ],
        detail: () => detail(a, rs.map((r) => r.name)),
      };
      const mod = firstModule(m?.modules) || _t('(unknown module)');
      byModule.set(mod, [...(byModule.get(mod) ?? []), row]);
    }
    const sections: MxSection[] = [...byModule].sort(([x], [y]) => x.localeCompare(y)).map(([mod, rows]) => ({
      title: mod, note: _t('%s models', rows.length), folded: false,
      rows: rows.sort((x, y) => String(x.label[0]).localeCompare(String(y.label[0]))),
    }));
    const table = matrix(_t('Model'), [...modeHeads(), _t('Rules')], sections);

    // filter, only differences / only what the tried groups add
    const { bar } = tpl('toolbar', { bar: HTMLDivElement }).refs;
    const { text: count } = tpl('count', { text: HTMLSpanElement }).refs;
    let only = '';
    const apply = () => { count.textContent = _t('%s of %s models', filterMatrix(table, f.input.value, (r) => !only || (r.dataset.tags ?? '').split(' ').includes(only)), ids.length); };
    const f = filterBox([], _t('Filter models or modules…'));
    f.input.addEventListener('input', apply);
    const toggle = (mark: 'added' | 'differs', label: string) => {
      const b = button(label, () => { only = only === mark ? '' : mark; for (const x of bar.querySelectorAll('.chip')) x.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', String(only === mark)); apply(); }, 'chip');
      b.setAttribute('aria-pressed', 'false');
      return b;
    };
    bar.append(f.input, ...(sim.tried.size ? [toggle('added', _t('Only what the tried groups add'))] : []), ...(theirs ? [toggle('differs', _t('Only differences'))] : []), count);
    apply();
    const legend = note(theirs ? _t('Each cell: %s | %s. From the ACLs: the Rules column counts the rules limiting which records. Click a model for the details.', sim.user.name, other!.user.name)
      : _t('From the ACLs: the Rules column counts the rules limiting which records. +✓ added by the tried groups. Click a model for the details.'));
    legend.classList.add('legend');
    return box(bar, table, legend);
  });
}

function detail(a: ModelRights | undefined, rules: string[]): Node {
  const lines = (a?.acls ?? []).map((r) => `${r.group_id ? r.group_id[1] : _t('every user')}: ${MODES.filter((m) => r[`perm_${m}`]).map(modeLabel).join(', ')}`);
  return box(
    note(_t('Granted by')), plainList(lines.length ? lines : [_t('nothing for this user')]),
    ...(rules.length ? [note(_t('Rules limiting the records')), plainList(rules)] : []),
  );
}
