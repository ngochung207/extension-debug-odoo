// Perf tab: Odoo's built-in server profiler (/web/set_profiling → ir.profile rows), read back per request.
import { sqlSummary, appFrame } from './logic.js';
import { pageFetch } from '../../shared/page.js';
import { exec, rpc, call, fieldsOf, el, pre, pill, details, collapsed, empty, block, errBox, expandable, listHead } from '../../shared/ui.js';
import { _t } from '../../shared/i18n.js';

const COLLECTORS = 'sql,traces_async';
const ms = (s) => `${Math.round((s || 0) * 1000)} ms`;
const short = (file) => file.replace(/^.*?\/((odoo\/)?addons\/|odoo\/)/, '$1');
const frame = (f) => (f ? `${short(f[0])}:${f[1]} ${f[2]}()` : '');

async function setProfiling(on) {
  const r = await exec(pageFetch, `/web/set_profiling?profile=${on ? 1 : 0}&collectors=${COLLECTORS}`);
  if (!r || r.error) throw new Error(r?.error || _t('Cannot call /web/set_profiling'));
  if (r.status !== 200) throw new Error(r.text.replace(/^error: /, '') || `HTTP ${r.status}`);
  return JSON.parse(r.text);
}

async function enable() {
  let st = await setProfiling(true);
  if (st.type) { // an ir.actions.act_window = Odoo's "enable profiling for…" wizard: not enabled on this database yet
    if (!confirm(_t('Profiling is not enabled on this database.\nEnable it for 5 minutes? (writes ir.config_parameter base.profiling_enabled_until)'))) return;
    const [id] = await call('base.enable.profiling.wizard', 'create', [[{ duration: 'minutes_5' }]]);
    await call('base.enable.profiling.wizard', 'submit', [[id]]);
    st = await setProfiling(true);
    if (st.type) throw new Error(_t('Profiling could not be enabled.'));
  }
}

export function renderPerf(s, state) {
  const rerender = () => { s.replaceChildren(); renderPerf(s, state); };
  const { origin } = state;
  const info = rpc('/web/session/get_session_info', {}); // not sessionInfo(): profile_session changes with the button

  block(s, _t('Server profiler'), async () => {
    const { profile_session: session } = await info;
    const btn = el('button', {
      class: 'btn',
      onclick: async () => {
        btn.disabled = true;
        try { session ? await setProfiling(false) : await enable(); rerender(); } catch (e) { btn.disabled = false; btn.after(errBox(e)); }
      },
    }, session ? _t('Stop profiling') : _t('Start profiling'));
    return el('div', { class: 'pad' },
      el('div', { class: 'row' }, pill(session ? _t('RECORDING') : _t('off'), session ? 'ok' : ''),
        el('span', { class: 'grow muted' }, session || _t('Every request of this session will record its SQL + Python stacks.')), btn),
      el('p', { class: 'note' }, _t('Uses Odoo\'s built-in profiler, needs base.group_system. While recording, each request writes one ir.profile row to the DB; Odoo stops it when it expires. Press ⟳ to reload the list.')));
  });

  block(s, _t('Profiled requests'), async () => {
    const { profile_session: session } = await info;
    const known = await fieldsOf('ir.profile');
    const rows = await call('ir.profile', 'search_read', [session ? [['session', '=', session]] : []],
      { fields: ['name', 'session', 'duration', 'cpu_duration', 'sql_count', 'create_date'].filter((f) => f in known), limit: 100 }); // cpu_duration: 19+ only
    if (!rows.length) return empty(session ? _t('No request yet: use the Odoo page, then press ⟳.') : _t('No profile data yet.'));
    return el('div', {},
      session ? null : el('div', { class: 'muted pad-top' }, _t('Latest session: %s', rows[0].session)),
      listHead(_t('Request · SQL · duration'), _t('Id · date · CPU')), el('ul', { class: 'list' }, rows.map((r) => profileItem(r, origin))));
  });
}

function profileItem(r, origin) {
  const slowSql = r.sql_count > 50;
  const li = el('li', {},
    el('div', { class: 'row' }, el('span', { class: 'name grow' }, r.name.replace(/\?$/, '')),
      pill(`${r.sql_count} SQL`, slowSql ? 'err' : ''), el('span', { class: 'ms' }, ms(r.duration)),
      el('a', { class: 'btn', href: `${origin}/web/speedscope/${r.id}`, target: '_blank', rel: 'noopener', title: _t('Flame graph (speedscope)') }, '↗')),
    el('div', { class: 'meta' }, [`#${r.id}`, r.create_date, 'cpu_duration' in r && `CPU ${ms(r.cpu_duration)}`].filter(Boolean).join(' · ')));
  return expandable(li, async () => sqlDetail(r, await call('ir.profile', 'read', [[r.id], ['sql']])));
}

function sqlDetail(r, [p]) {
  let entries = [];
  try { entries = JSON.parse(p?.sql || '[]'); } catch { /* not JSON */ }
  if (!entries.length) return empty(_t('No SQL recorded.'));
  const sum = sqlSummary(entries);
  const q = (e, extra) => el('li', {},
    el('div', { class: 'row' }, extra, el('span', { class: 'grow meta' }, frame(appFrame(e.stack))), el('span', { class: 'ms' }, ms(e.time))),
    el('div', { class: 'mono muted' }, e.query.length > 200 ? `${e.query.slice(0, 200)}…` : e.query),
    collapsed(_t('Full SQL + stack'), pre(e.full_query || e.query), e.stack?.length ? pre(e.stack.map(frame).join('\n')) : null));
  return el('div', {},
    el('div', { class: 'muted' }, _t('%s queries · SQL %s / total %s · Python ≈ %s', sum.count, ms(sum.time), ms(r.duration), ms(Math.max(0, r.duration - sum.time)))),
    sum.dups.length
      ? details(_t('Repeated queries — N+1 suspects (%s)', sum.dups.length), listHead(_t('Count · caller · time'), _t('Query')), el('ul', { class: 'list' },
        sum.dups.map((g) => q({ ...g.first, time: g.time }, pill(`${g.count}×`, g.count >= 5 ? 'err' : 'med')))))
      : el('div', { class: 'okline' }, _t('✓ No repeated query.')),
    details(_t('Slowest queries (%s)', sum.slow.length), listHead(_t('Caller · time'), _t('Query')), el('ul', { class: 'list' }, sum.slow.map((e) => q(e, null)))));
}
