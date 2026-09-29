// RPC tab: live log of the page's JSON-RPC calls, recorded by content/hook.js.
import { parseRpc } from './logic.js';
import { pageRpcLog } from './page.js';
import { exec } from '../../shared/bridge.js';
import { $, el, pre, errBox, pill, details, empty, expandable, listHead } from '../../shared/ui.js';
import { _t } from '../../shared/i18n.js';

const MAX = 300;
let onlyErrors = false;
let rows, filter, emptyMsg, onWhyBlocked;

/** Builds the tab once. `whyBlocked()` jumps to the Security tab for an AccessError. */
export function mountRpc(section, whyBlocked) {
  onWhyBlocked = whyBlocked;
  filter = el('input', { type: 'search', placeholder: _t('Filter model / method') });
  filter.addEventListener('input', () => { for (const li of rows.children) applyFilter(li); });
  const errBtn = el('button', { class: 'chip', 'aria-pressed': 'false' }, _t('Errors Only'));
  errBtn.addEventListener('click', () => {
    onlyErrors = !onlyErrors;
    errBtn.setAttribute('aria-pressed', onlyErrors);
    for (const li of rows.children) applyFilter(li);
  });
  const clear = el('button', { class: 'chip', onclick: () => { rows.replaceChildren(); count(); } }, _t('Clear'));
  rows = el('ul', { class: 'list' });
  emptyMsg = empty(_t('No RPC yet. Use the Odoo page to record some.'));
  section.append(el('div', { class: 'toolbar' }, filter, errBtn, clear, listHead(_t('Method · model · duration'), _t('Time · route'))), rows, emptyMsg);
}

function applyFilter(li) {
  li.hidden = !li.dataset.q.includes(filter.value.toLowerCase()) || (onlyErrors && !li.classList.contains('is-err'));
}

function item(e) {
  const denied = e.errorType?.endsWith('AccessError');
  const li = el('li', { class: e.error ? 'is-err' : '' },
    el('div', { class: 'row' }, el('span', { class: 'dot' }), el('span', { class: 'name' }, e.method),
      el('span', { class: 'grow muted' }, e.model), e.error ? pill(denied ? '🔒 AccessError' : e.errorType?.split('.').pop() || _t('error'), 'err') : null,
      el('span', { class: 'ms' }, `${e.ms} ms`)),
    el('div', { class: 'meta' }, `${(e.at || '').slice(11, 19)} · ${e.path}`));
  li.dataset.q = `${e.model} ${e.method}`.toLowerCase();
  expandable(li, () => {
    const params = pre({ args: e.args, kwargs: e.kwargs });
    if (e.error) { // errors: the message + traceback come first
      return el('div', {}, details(_t('Parameters'), params), errBox({ message: e.error, traceback: e.traceback }),
        denied && el('button', { class: 'btn mt', onclick: onWhyBlocked }, _t('Why was it blocked? → Security')));
    }
    const res = JSON.stringify(e.result, null, 2) ?? '';
    return el('div', {}, details(_t('Parameters'), params),
      details(_t('Result'), pre(res.length > 50000 ? `${res.slice(0, 50000)}\n${_t('… (%s characters)', res.length)}` : res)));
  });
  applyFilter(li);
  return li;
}

function count() {
  const n = rows.children.length;
  $('#rpc-count').textContent = n || '';
  emptyMsg.hidden = n > 0;
}

/** raw: an entry of hook.js, as an object (page buffer) or its JSON text (live message). */
export function addRpc(raw) {
  let e;
  try { e = parseRpc(typeof raw === 'string' ? JSON.parse(raw) : raw); } catch { return; } // malformed: skip it, keep the log going
  if (!e) return;
  rows.prepend(item(e)); // newest first
  if (rows.children.length > MAX) rows.lastElementChild.remove();
  count();
}

/** Fills the log with what the page recorded before the panel opened. */
export async function reloadRpc() {
  const buf = await exec(pageRpcLog);
  rows.replaceChildren(); // after the await: live messages received meanwhile are in the buffer too
  if (Array.isArray(buf)) for (const raw of buf) addRpc(raw);
  count();
}
